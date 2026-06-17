import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeLoginIdentifier } from '@/lib/username';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  // Accepts an email OR a username.
  identifier: z.string().min(1).max(254),
  password: z.string().min(6).max(128),
});

/**
 * Server-side login by email OR username. Centralizing the credential check here
 * lets us rate-limit brute-force attempts. When the identifier isn't an email we
 * resolve it to the account's email via the service role (usernames are unique),
 * then sign in with password as usual.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { identifier, password } = parsed.data;
  // Strip a leading @ so "@hakimova80" works the same as "hakimova80".
  const id = normalizeLoginIdentifier(identifier);

  const ip = getClientIp(request);
  const rl = await enforceRateLimit('login', `login:${ip}:${id.toLowerCase()}`);
  if (!rl.success) {
    return tooManyRequests(
      rl,
      "Juda ko'p urinish. Iltimos, biroz kuting va qayta urinib ko'ring."
    );
  }

  // Resolve username → email when the identifier isn't an email address.
  let email = id;
  if (!id.includes('@')) {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from('users')
      .select('email')
      .eq('username', id.toLowerCase())
      .maybeSingle();
    if (!row?.email) {
      // Same generic message as a wrong password — no account enumeration.
      return NextResponse.json({ error: "Email yoki parol noto'g'ri" }, { status: 401 });
    }
    email = row.email;
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
