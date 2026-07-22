import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { confirmDonation } from '@/lib/payments/confirm';
import { decryptToken, isTokenCipherConfigured } from '@/lib/crypto/token-cipher';
import { cardTokenPayment, isClickCardTokenConfigured } from '@/lib/payments/providers/click-card-token';

export const runtime = 'nodejs';

// Charge a PENDING donation with a saved Click token. SERVER-ONLY.
//
// This is a SEPARATE payment path from Checkout JS, but it converges on the SAME,
// UNMODIFIED confirmDonation() — the single crediting authority. card_token/payment
// is SYNCHRONOUS (no Prepare/Complete callbacks), so we finalise from its response.
// The amount is read from the donation row (server-set), never trusted from the
// client, so passing it back to confirmDonation is a real amount match.

const schema = z.object({
  donationId: z.string().uuid(),
  savedCardId: z.string().uuid(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit('donation', `card-pay:${ip}`);
  if (!rl.success) return tooManyRequests(rl, "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.");

  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  if (!isClickCardTokenConfigured() || !isTokenCipherConfigured()) {
    return NextResponse.json({ error: 'saved_cards_unavailable' }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { donationId, savedCardId } = parsed.data;

  const admin = createAdminClient();

  // The donation must be this user's own, still pending, and a Click donation.
  const { data: donation } = await admin
    .from('donations')
    .select('id, amount, status, payment_ref, donor_id')
    .eq('id', donationId)
    .maybeSingle();
  if (!donation || donation.donor_id !== user.id || donation.status !== 'pending' || !donation.payment_ref) {
    return NextResponse.json({ error: 'donation_invalid' }, { status: 409 });
  }

  // The card must be this user's own and active. Only the service role can read
  // the ciphertext; decryption happens here, server-side, never in the browser.
  const { data: card } = await admin
    .from('saved_payment_methods')
    .select('id, token_ciphertext, enc_version, is_active, user_id')
    .eq('id', savedCardId)
    .maybeSingle();
  if (!card || card.user_id !== user.id || !card.is_active) {
    return NextResponse.json({ error: 'card_invalid' }, { status: 409 });
  }

  let token: string;
  try {
    token = decryptToken(card.token_ciphertext, card.enc_version ?? 1);
  } catch {
    return NextResponse.json({ error: 'card_invalid' }, { status: 409 });
  }

  const result = await cardTokenPayment({
    cardToken: token,
    amount: donation.amount, // server-set; Click charges exactly this
    transactionParameter: donation.payment_ref,
  });

  if (!result.ok) {
    // Dead token → deactivate so the UI stops offering it and asks for a new card.
    if (result.invalidToken) {
      await admin
        .from('saved_payment_methods')
        .update({ is_active: false, is_default: false })
        .eq('id', savedCardId)
        .eq('user_id', user.id);
      return NextResponse.json({ status: 'failed', invalidToken: true }, { status: 402 });
    }
    // Transient decline — donation stays pending; the donor can retry / another
    // card / Checkout JS. Never credited.
    return NextResponse.json({ status: 'failed', code: result.errorCode ?? null }, { status: 402 });
  }

  // Success — finalise through the ONE crediting path. Idempotent + amount-verified.
  const outcome = await confirmDonation(donation.payment_ref, 'completed', {
    amount: donation.amount,
    currency: 'UZS',
  });
  if (outcome.status !== 'completed' && outcome.status !== 'noop') {
    return NextResponse.json({ status: 'failed', reason: outcome.reason }, { status: 402 });
  }

  await admin
    .from('saved_payment_methods')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', savedCardId)
    .eq('user_id', user.id);

  return NextResponse.json({ status: 'completed', reference: donation.payment_ref });
}
