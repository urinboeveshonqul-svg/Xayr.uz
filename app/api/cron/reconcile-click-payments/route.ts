import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/security/cron';
import { reconcilePendingClickPayments } from '@/lib/payments/reconcile-click';

export const runtime = 'nodejs';
// Never cache — this reconciles live payment state.
export const dynamic = 'force-dynamic';

/**
 * Click payment reconciliation sweep (audit F-1 safety net).
 *
 * Detects card payments captured at Click whose donation is still 'pending'
 * (embedded checkout.js with no callback, or any lost callback) and alerts
 * admins so nothing can sit captured-but-pending silently. It never credits or
 * fails a donation — see lib/payments/reconcile-click.ts. Inert unless
 * CLICK_MERCHANT_USER_ID is configured.
 *
 * Auth: CRON_SECRET Bearer (fail-closed in production via verifyCronSecret).
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const result = await reconcilePendingClickPayments();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/reconcile-click-payments] error:', err);
    return NextResponse.json({ error: 'reconcile_failed' }, { status: 500 });
  }
}
