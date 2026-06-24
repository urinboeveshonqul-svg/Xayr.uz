import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { verifyTurnstile, tokenFromBody } from '@/lib/turnstile';
import { getClientIp, rateLimitOr429 } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Password-reset email request. Routed server-side so it can be Turnstile-gated
 * and rate-limited (prevents reset-email bombing). Always responds the same way
 * regardless of whether the email exists (no account enumeration).
 */
const schema = z.object({ email: z.string().email().max(254) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const ip = getClientIp(request);
  const ts = await verifyTurnstile(tokenFromBody(body), ip);
  if (!ts.success) {
    return NextResponse.json({ error: 'captcha_failed' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { email } = parsed.data;

  // Dedicated 'reset' limiter throttles reset-email abuse (anti-bombing).
  const limited = await rateLimitOr429(request, 'reset', {
    message: "Juda ko'p urinish. Iltimos, biroz kuting va qayta urinib ko'ring.",
  });
  if (limited) return limited;

  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  // Always 200 — never reveal whether the address is registered.
  return NextResponse.json({ ok: true });
}
