import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/security/cron';

export const runtime = 'nodejs';
// Never cache — this is a scheduled mutation.
export const dynamic = 'force-dynamic';

/**
 * Daily sweep that archives campaigns whose deadline has passed: → 'funded'
 * (goal reached) or → 'expired' (goal not reached). Invoked by Vercel Cron
 * (see vercel.json); the DB function expire_due_campaigns() does the work and
 * the campaign-status trigger notifies each owner.
 *
 * Auth: CRON_SECRET must be presented as a Bearer token (Vercel attaches this
 * header automatically to scheduled invocations). Compared in constant time.
 *
 * PRODUCTION FAILS CLOSED: without CRON_SECRET this endpoint refuses every
 * request. It is a publicly-routable mutation, so running it unauthenticated
 * would let anyone trigger the sweep at will. Locally the secret is optional so
 * the cron can be exercised by hand.
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

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
