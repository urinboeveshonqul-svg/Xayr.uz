import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
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

  const ip = getClientIp(request);
  const rl = await enforceRateLimit('signup', `signup:${ip}`);
  if (!rl.success) {
    return tooManyRequests(
      rl,
      "Juda ko'p urinish. Iltimos, biroz kuting va qayta urinib ko'ring."
    );
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
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
