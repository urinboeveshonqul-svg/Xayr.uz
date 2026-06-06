import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized', userId: '' };
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { ok: false as const, status: 403, error: 'Forbidden', userId: '' };
  return { ok: true as const, status: 200, error: '', userId: user.id };
}

// GET /api/admin/verifications?requestId=…  → short-lived signed URLs for the docs
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const requestId = new URL(request.url).searchParams.get('requestId');
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from('identity_documents')
    .select('doc_type, storage_path')
    .eq('request_id', requestId);

  const documents: { doc_type: string; url: string }[] = [];
  for (const d of docs ?? []) {
    const { data } = await admin.storage
      .from('verification-documents')
      .createSignedUrl(d.storage_path, 300); // 5 minutes
    if (data?.signedUrl) documents.push({ doc_type: d.doc_type, url: data.signedUrl });
  }
  return NextResponse.json({ documents });
}

const postSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).nullable().optional(),
});

// POST → approve / reject a verification request
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { requestId, action, reason } = parsed.data;

  const admin = createAdminClient();
  const { data: req } = await admin
    .from('verification_requests')
    .select('user_id')
    .eq('id', requestId)
    .single();
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newStatus = action === 'approve' ? 'verified' : 'rejected';

  await admin
    .from('verification_requests')
    .update({
      status: newStatus,
      rejection_reason: action === 'reject' ? (reason ?? null) : null,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // Mirror the decision onto the user row so the profile page can show it
  // directly: set verified_at on approval, store the reason on rejection.
  await admin
    .from('users')
    .update({
      verification_status: newStatus,
      verified_at: action === 'approve' ? new Date().toISOString() : null,
      rejection_reason: action === 'reject' ? (reason ?? null) : null,
    })
    .eq('id', req.user_id);

  return NextResponse.json({ ok: true });
}
