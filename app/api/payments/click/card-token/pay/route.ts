import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { decryptToken, isTokenCipherConfigured } from '@/lib/crypto/token-cipher';
import { cardTokenPayment, isClickCardTokenConfigured } from '@/lib/payments/providers/click-card-token';

export const runtime = 'nodejs';

// Place a charge on a PENDING donation with a saved Click token. SERVER-ONLY.
//
// This only TRIGGERS the charge. It does NOT finalize the donation and NEVER
// calls confirmDonation(). Per Click's confirmed lifecycle, a successful
// card_token/payment is followed by the normal SHOP API Prepare + Complete
// callbacks (app/api/payments/click), and the COMPLETE callback finalizes via
// confirmDonation() — exactly like Checkout JS. So finalization has one path for
// both flows, and the Prepare/Complete race (a pre-completed donation making
// Prepare answer AlreadyPaid) cannot happen because the donation stays `pending`
// here. The amount is read from the donation row (server-set), sent to Click in
// UZS (so'm); the client hands off to the polling /payment/success page.

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

  // Not accepted (payment_status 0 / error_code ≠ 0): the charge was not placed.
  if (!result.accepted) {
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

  // Accepted (payment_status 1 or 2). DO NOT finalize here — the SHOP API Complete
  // callback finalizes via confirmDonation(), like Checkout JS. The donation stays
  // `pending`; the client hands off to the polling success page.
  await admin
    .from('saved_payment_methods')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', savedCardId)
    .eq('user_id', user.id);

  return NextResponse.json({ status: 'accepted', reference: donation.payment_ref }, { status: 202 });
}
