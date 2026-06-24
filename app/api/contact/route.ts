import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTurnstile, tokenFromBody, TURNSTILE_FAILED_MESSAGE } from '@/lib/security/turnstile';
import { getClientIp, rateLimitOr429 } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Contact form submission. Routed server-side so the message is gated by
 * server-side Turnstile verification before it lands in contact_messages
 * (previously inserted directly from the client). Admins read at /admin/messages.
 */
const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  subject: z.string().max(150).nullable().optional(),
  message: z.string().min(10).max(2000),
});

export async function POST(request: Request) {
  // Rate limit by IP first (cheapest check, before any parsing/DB work).
  const limited = await rateLimitOr429(request, 'contact');
  if (limited) return limited;

  const body = await request.json().catch(() => null);

  // Verify the human-check BEFORE doing any work.
  const ts = await verifyTurnstile(tokenFromBody(body), getClientIp(request));
  if (!ts.success) {
    return NextResponse.json({ error: TURNSTILE_FAILED_MESSAGE }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { name, email, subject, message } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from('contact_messages').insert({
    name: name.trim(),
    email: email.trim(),
    subject: subject?.trim() || null,
    message: message.trim(),
  });
  if (error) {
    return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
