import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
// Never cache — this is a scheduled mutation.
export const dynamic = 'force-dynamic';

/**
 * Daily financial snapshot. Invoked by Vercel Cron (see vercel.json). The DB
 * function generate_financial_snapshot() is idempotent (one row per day, never
 * overwrites history), so re-runs are safe. Returns whether a new snapshot was
 * created. Auth mirrors the other crons: CRON_SECRET as a Bearer token when set,
 * fail-open-with-warning when unconfigured.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[cron/financial-snapshot] CRON_SECRET not set — running unauthenticated.');
  }

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
