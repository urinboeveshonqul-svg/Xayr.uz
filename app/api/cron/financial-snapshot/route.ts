import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/security/cron';

export const runtime = 'nodejs';
// Never cache — this is a scheduled mutation.
export const dynamic = 'force-dynamic';

/**
 * Daily financial snapshot. Invoked by Vercel Cron (see vercel.json). The DB
 * function generate_financial_snapshot() is idempotent (one row per day, never
 * overwrites history), so re-runs are safe. Returns whether a new snapshot was
 * created. Auth mirrors the other crons: CRON_SECRET as a Bearer token, compared
 * in constant time, FAILING CLOSED in production when unset.
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('generate_financial_snapshot', {});
    if (error) {
      console.error('[cron/financial-snapshot] rpc error:', error.message);
      return NextResponse.json({ error: 'snapshot_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, created: data === true });
  } catch (err) {
    console.error('[cron/financial-snapshot] error:', err);
    return NextResponse.json({ error: 'snapshot_failed' }, { status: 500 });
  }
}
