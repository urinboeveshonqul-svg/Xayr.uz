import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTurnstile, tokenFromBody, turnstileFailureResponse } from '@/lib/security/turnstile';
import { getClientIp } from '@/lib/rate-limit';
import { isValidE164 } from '@/lib/phone';

export const runtime = 'nodejs';

const VERIFICATION_BUCKET = 'verification-documents';

/**
 * Validate a KYC document reference before it is trusted into the record.
 * Returns an error code string when INVALID, or null when the object is safe:
 *   • correct owner  — path is under `${userId}/`
 *   • object exists  — the file is actually present in the private bucket
 *   • expected type  — its stored content-type is an image
 * Uses the service-role admin client (the caller already authenticated the user).
 */
async function validateVerificationDocument(
  admin: ReturnType<typeof createAdminClient>,
  path: string,
  userId: string
): Promise<string | null> {
  if (typeof path !== 'string' || !path.startsWith(`${userId}/`)) return 'owner';

  const slash = path.lastIndexOf('/');
  if (slash < 0) return 'owner';
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);
  if (!name) return 'empty';

  const { data, error } = await admin.storage
    .from(VERIFICATION_BUCKET)
    .list(dir, { search: name, limit: 100 });
  if (error) return 'lookup';

  const obj = (data ?? []).find((o) => o.name === name);
  if (!obj) return 'missing';

  // Supabase records the upload's content-type in the object metadata. The bucket
  // MIME allow-list (migration #56) blocks non-images at upload, and this is the
  // read-side backstop.
  const mime =
    typeof obj.metadata?.mimetype === 'string' ? (obj.metadata.mimetype as string) : '';
  if (!mime.startsWith('image/')) return 'mime';

  return null;
}

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
  if (!ts.success) return turnstileFailureResponse(ts);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { legal_name, date_of_birth, address, phone, documents } = parsed.data;

  const admin = createAdminClient();

  // Every document path must reference a REAL object in the private
  // verification-documents bucket, under THIS user's own folder, that is actually
  // an image. The prefix check alone (own-folder) is not enough — the client
  // sends storage paths, so we confirm each object exists and its stored
  // content-type is an image before trusting it into the KYC record. A crafted
  // request that points at a non-existent path or a non-image is rejected.
  const paths = [documents.id_front, documents.selfie, ...(documents.id_back ? [documents.id_back] : [])];
  for (const p of paths) {
    const invalid = await validateVerificationDocument(admin, p, user.id);
    if (invalid) {
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
