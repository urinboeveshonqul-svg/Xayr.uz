import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/security/cron';
import { expireAbandonedDonations } from '@/lib/payments/expiry';

export const runtime = 'nodejs';
// Never cache — this mutates live donation state.
export const dynamic = 'force-dynamic';

/**
 * Abandoned-donation expiry sweep.
 *
 * Relabels 'pending' donations older than DONATION_EXPIRY_HOURS (default 72h) as
 * 'expired', so a donor who opened a payment page and closed it stops sitting in
 * the admin queue and inflating the admin nav badge forever.
 *
 * It never deletes a row, never moves money, and never blocks a real payment: an
 * expired donation stays completable, so a verified late provider callback still
 * credits it exactly once (lib/payments/confirm.ts).
 *
 * Auth: CRON_SECRET Bearer (fail-closed in production via verifyCronSecret).
 * Schedule: vercel.json → daily. Safe to trigger manually and to run twice.
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const result = await expireAbandonedDonations();
    // Counts only — no donor, campaign or payment detail is logged.
    console.log('[cron/expire-donations]', {
      expired: result.expired,
      expiryHours: result.expiryHours,
      moreRemaining: result.moreRemaining,
      durationMs: result.durationMs,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/expire-donations] error:', err);
    return NextResponse.json({ error: 'expire_failed' }, { status: 500 });
  }
}
