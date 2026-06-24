import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { sanitizeUsernameInput, isValidUsername } from '@/lib/username';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { verifyTurnstile, tokenFromBody } from '@/lib/turnstile';

export const runtime = 'nodejs';

const schema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
  username: z.string().min(3).max(30),
});

/**
 * Server-side signup. Routing registration through the server lets us
 * rate-limit mass account creation. Mirrors the previous client behavior:
 * `full_name` is forwarded to the handle_new_user trigger and the email
 * confirmation link returns to /auth/callback.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { full_name, email, password } = parsed.data;
  // Sanitize (strip @/spaces, lowercase, collapse repeats) then validate — never
  // trust the client. Stored bare, without @.
  const username = sanitizeUsernameInput(parsed.data.username);

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: "Foydalanuvchi nomi noto'g'ri" }, { status: 422 });
  }

  const ip = getClientIp(request);
  const rl = await enforceRateLimit('signup', `signup:${ip}`);
  if (!rl.success) {
    return tooManyRequests(
      rl,
      "Juda ko'p urinish. Iltimos, biroz kuting va qayta urinib ko'ring."
    );
  }

  // Bot/abuse gate — server-side Turnstile verification (never trust the client).
  const ts = await verifyTurnstile(tokenFromBody(body), ip);
  if (!ts.success) {
    return NextResponse.json(
      { error: "Tasdiqlash amalga oshmadi. Iltimos, qayta urinib ko'ring." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Reserved / already-taken check before creating the account.
  const { data: available } = await supabase.rpc('is_username_available', { candidate: username });
  if (available === false) {
    return NextResponse.json({ error: 'username_taken' }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // handle_new_user reads `username` (and falls back to a generated one if
      // it was taken in a race — signup never fails on username).
      data: { full_name, username },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    const message = error.message.includes('already registered')
      ? "Bu email allaqachon ro'yxatdan o'tgan"
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Supabase returns a user with an empty `identities` array when the email is
  // already registered (anti-enumeration). Surface as a duplicate.
  if (data.user && data.user.identities?.length === 0) {
    return NextResponse.json(
      { error: "Bu email allaqachon ro'yxatdan o'tgan" },
      { status: 409 }
    );
  }

  // needsConfirmation === true when email confirmation is enabled (no session).
  return NextResponse.json({ ok: true, needsConfirmation: !data.session });
}
