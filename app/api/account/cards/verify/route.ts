import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { cardTokenVerify, isClickCardTokenConfigured } from '@/lib/payments/providers/click-card-token';
import { encryptToken, decryptToken, isTokenCipherConfigured } from '@/lib/crypto/token-cipher';
import { isCardRegistrationEnabled } from '@/components/payments/saved-card-constants';

export const runtime = 'nodejs';

// Step 2 of saving a card: the donor enters the SMS OTP. We decrypt the envelope
// from /request, re-check ownership + expiry, call Click's card_token/verify, and
// on success ENCRYPT the now-persistent token and store it via save_card (which
// runs as the authenticated user). The plaintext token never leaves the server
// and is never returned to the browser.

const schema = z.object({
  enrollment: z.string().min(1),
  sms_code: z.string().min(3).max(10),
  card_holder: z.string().max(120).nullable().optional(),
  make_default: z.boolean().optional().default(false),
});

interface Envelope { t: string; u: string; b: 'uzcard' | 'humo' | null; l: string; exp: number }

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit('donation', `card-verify:${ip}`);
  if (!rl.success) return tooManyRequests(rl, "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  // New-card registration is temporarily disabled (see saved-card-constants).
  if (!isCardRegistrationEnabled()) {
    return NextResponse.json({ error: 'card_registration_disabled' }, { status: 503 });
  }

  if (!isClickCardTokenConfigured() || !isTokenCipherConfigured()) {
    return NextResponse.json({ error: 'saved_cards_unavailable' }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { enrollment, sms_code, card_holder, make_default } = parsed.data;

  // Decrypt + validate the envelope from /request.
  let env: Envelope;
  try {
    env = JSON.parse(decryptToken(enrollment)) as Envelope;
  } catch {
    return NextResponse.json({ error: 'enrollment_invalid' }, { status: 400 });
  }
  if (env.u !== user.id) return NextResponse.json({ error: 'enrollment_invalid' }, { status: 403 });
  if (!env.exp || Date.now() > env.exp) return NextResponse.json({ error: 'enrollment_expired' }, { status: 410 });

  // Confirm the token with Click.
  const verified = await cardTokenVerify({ cardToken: env.t, smsCode: sms_code });
  if (!verified.ok) {
    return NextResponse.json({ error: 'otp_failed', code: verified.errorCode ?? null }, { status: 400 });
  }

  // Encrypt the persistent token and store it (as the authenticated user).
  const { ciphertext, version } = encryptToken(env.t);
  const { data: cardId, error } = await supabase.rpc('save_card', {
    p_provider: 'click',
    p_token_ciphertext: ciphertext,
    p_enc_version: version,
    p_token_id: null,
    p_card_brand: env.b,
    p_last4: env.l,
    p_card_holder: card_holder?.trim() || null,
    p_make_default: make_default,
  });
  if (error) {
    console.error('[cards/verify] save_card failed', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({
    card: { id: cardId, brand: env.b, last4: env.l, is_default: make_default },
  });
}
