import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/security/cron';
import { cleanupAbandonedDrafts } from '@/lib/drafts/cleanup';

export const runtime = 'nodejs';
// Never cache — this is a scheduled mutation.
export const dynamic = 'force-dynamic';

/**
 * Daily sweep that deletes abandoned campaign drafts (untouched for 30 days) and
 * garbage-collects the images they uploaded to the campaign-images bucket, but
 * only images referenced by nothing else. Published/pending/rejected campaigns
 * and their images are never touched. The work lives in the reusable
 * lib/drafts/cleanup service so a manual admin trigger or maintenance script can
 * reuse it.
 *
 * Auth: CRON_SECRET must be presented as a Bearer token (Vercel attaches this
 * header automatically to scheduled invocations); compared in constant time and
 * FAILS CLOSED in production when the secret is unset.
 *
 * Logging is summary-only — counts + duration, never user data or secrets.
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const admin = createAdminClient();
    const summary = await cleanupAbandonedDrafts(admin);
    console.log('[cron/cleanup-drafts]', JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron/cleanup-drafts] error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'cleanup_failed' }, { status: 500 });
  }
}
