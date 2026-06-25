import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTurnstile, tokenFromBody, TURNSTILE_FAILED_MESSAGE } from '@/lib/security/turnstile';
import { getClientIp } from '@/lib/rate-limit';
import { isValidE164 } from '@/lib/phone';

export const runtime = 'nodejs';

const schema = z.object({
  legal_name: z.string().min(3).max(120),
  date_of_birth: z.string().min(8).max(10), // YYYY-MM-DD
  address: z.string().min(5).max(300),
  // Required Uzbekistan phone in E.164 (+998 + 9 digits). Validated server-side
  // (never trust the client); for identity/contact/payout — not for login.
  phone: z.string().refine((v) => isValidE164(v), { message: 'invalid_phone' }),
  documents: z.object({
    id_front: z.string(),
    id_back: z.string().nullable().optional(),
    selfie: z.string(),
  }),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);

  // Bot/abuse gate — server-side Turnstile verification (never trust the client).
  const ts = await verifyTurnstile(tokenFromBody(body), getClientIp(request));
  if (!ts.success) return NextResponse.json({ error: TURNSTILE_FAILED_MESSAGE }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { legal_name, date_of_birth, address, phone, documents } = parsed.data;

  const admin = createAdminClient();

  // Every document path must live in the user's own storage folder.
  const paths = [documents.id_front, documents.selfie, ...(documents.id_back ? [documents.id_back] : [])];
  for (const p of paths) {
    if (!p.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Invalid document path' }, { status: 400 });
    }
  }

  // Create request + documents, set status = pending.
  const { data: req, error: rErr } = await admin
    .from('verification_requests')
    .insert({
      user_id: user.id,
      legal_name,
      date_of_birth,
      address,
      phone, // E.164, e.g. +998901234567
      status: 'pending',
    })
    .select('id')
    .single();
  if (rErr || !req) return NextResponse.json({ error: 'Could not submit' }, { status: 500 });

  const docRows = [
    { request_id: req.id, user_id: user.id, doc_type: 'id_front' as const, storage_path: documents.id_front },
    { request_id: req.id, user_id: user.id, doc_type: 'selfie' as const, storage_path: documents.selfie },
    ...(documents.id_back
      ? [{ request_id: req.id, user_id: user.id, doc_type: 'id_back' as const, storage_path: documents.id_back }]
      : []),
  ];
  await admin.from('identity_documents').insert(docRows);

  // Mirror the verified contact number onto the profile (contact / payout comms).
  await admin.from('users').update({ verification_status: 'pending', phone }).eq('id', user.id);

  return NextResponse.json({ ok: true, requestId: req.id });
}
