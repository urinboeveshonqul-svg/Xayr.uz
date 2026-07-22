import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { cardTokenRequest, isClickCardTokenConfigured } from '@/lib/payments/providers/click-card-token';
import { encryptToken, isTokenCipherConfigured } from '@/lib/crypto/token-cipher';

export const runtime = 'nodejs';

// Step 1 of saving a card: send the PAN+expiry+phone to Click's card_token/request
// (server-side, secret-signed), which SMS-OTPs the cardholder. The unverified
// token is returned to the browser ONLY inside an opaque, server-encrypted
// envelope — the browser can never read it. The PAN is used here and never
// logged or stored (only brand + last4 are derived and kept in the envelope).

const schema = z.object({
  card_number: z.string().regex(/^\d{16}$/),
  expire_date: z.string().regex(/^\d{4}$/), // MMYY
  phone_number: z.string().min(7).max(20),
});

const ENVELOPE_TTL_MS = 10 * 60 * 1000; // OTP window

/** UZ card brand from BIN: UZCARD 8600, HUMO 9860. Returns null if unknown. */
function brandFromPan(pan: string): 'uzcard' | 'humo' | null {
  if (pan.startsWith('8600')) return 'uzcard';
  if (pan.startsWith('9860')) return 'humo';
  return null;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit('donation', `card-request:${ip}`);
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

  const { card_number, expire_date, phone_number } = parsed.data;

  const result = await cardTokenRequest({
    cardNumber: card_number,
    expireDate: expire_date,
    phoneNumber: phone_number,
    temporary: false, // persistent token — this card is being SAVED
  });
  if (!result.ok || !result.cardToken) {
    return NextResponse.json(
      { error: 'card_request_failed', code: result.errorCode ?? null },
      { status: 502 }
    );
  }

  // Opaque, server-encrypted envelope: the browser holds it but cannot read the
  // token. Verify decrypts it, re-checks ownership + expiry, then confirms.
  const { ciphertext: enrollment } = encryptToken(
    JSON.stringify({
      t: result.cardToken,
      u: user.id,
      b: brandFromPan(card_number),
      l: card_number.slice(-4),
      exp: Date.now() + ENVELOPE_TTL_MS,
    })
  );

  return NextResponse.json({ enrollment, maskedPhone: result.maskedPhone ?? null });
}
