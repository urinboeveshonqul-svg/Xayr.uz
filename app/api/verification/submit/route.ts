import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const schema = z.object({
  legal_name: z.string().min(3).max(120),
  date_of_birth: z.string().min(8).max(10), // YYYY-MM-DD
  address: z.string().min(5).max(300),
  phone: z.string().min(7).max(20),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { legal_name, date_of_birth, address, phone, documents } = parsed.data;

  const admin = createAdminClient();

  // 1) Require a verified OTP for this phone.
  const { data: otp } = await admin
    .from('phone_otps')
    .select('verified')
    .eq('user_id', user.id)
    .eq('phone', phone.trim())
    .eq('verified', true)
    .limit(1)
    .maybeSingle();
  if (!otp) return NextResponse.json({ error: 'Phone not verified' }, { status: 400 });

  // 2) Every document path must live in the user's own storage folder.
  const paths = [documents.id_front, documents.selfie, ...(documents.id_back ? [documents.id_back] : [])];
  for (const p of paths) {
    if (!p.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Invalid document path' }, { status: 400 });
    }
  }

  // 3) Create request + documents, set status = pending.
  const { data: req, error: rErr } = await admin
    .from('verification_requests')
    .insert({
      user_id: user.id,
      legal_name,
      date_of_birth,
      address,
      phone,
      phone_verified: true,
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

  await admin.from('users').update({ verification_status: 'pending' }).eq('id', user.id);

  return NextResponse.json({ ok: true, requestId: req.id });
}
