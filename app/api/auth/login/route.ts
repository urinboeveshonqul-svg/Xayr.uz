import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
});

/**
 * Server-side login. Centralizing the credential check here (instead of the
 * browser calling Supabase directly) is what lets us rate-limit brute-force /
 * credential-stuffing attempts. The @supabase/ssr server client writes the
 * session cookies onto this response on success.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { email, password } = parsed.data;

  // Limit by IP + the targeted account, so one IP can't grind many accounts
  // and one account can't be ground from one IP.
  const ip = getClientIp(request);
  const rl = await enforceRateLimit('login', `login:${ip}:${email.toLowerCase()}`);
  if (!rl.success) {
    return tooManyRequests(
      rl,
      "Juda ko'p urinish. Iltimos, biroz kuting va qayta urinib ko'ring."
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.message.includes('Invalid login credentials')
      ? "Email yoki parol noto'g'ri"
      : error.message;
    return NextResponse.json({ error: message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
