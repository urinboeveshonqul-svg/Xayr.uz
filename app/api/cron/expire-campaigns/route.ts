import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
// Never cache — this is a scheduled mutation.
export const dynamic = 'force-dynamic';

/**
 * Daily sweep that archives campaigns whose deadline has passed: → 'funded'
 * (goal reached) or → 'expired' (goal not reached). Invoked by Vercel Cron
 * (see vercel.json); the DB function expire_due_campaigns() does the work and
 * the campaign-status trigger notifies each owner.
 *
 * Auth: when CRON_SECRET is set, the request must present it as a Bearer token
 * (Vercel attaches this header automatically to scheduled invocations). When it
 * is unset we still run but warn — matching the app's other
 * fail-open-when-unconfigured guards (rate-limit, turnstile).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[cron/expire-campaigns] CRON_SECRET not set — running unauthenticated.');
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('expire_due_campaigns', {});
    if (error) {
      console.error('[cron/expire-campaigns] rpc error:', error.message);
      return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, expired: data ?? 0 });
  } catch (err) {
    console.error('[cron/expire-campaigns] error:', err);
    return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
  }
}
