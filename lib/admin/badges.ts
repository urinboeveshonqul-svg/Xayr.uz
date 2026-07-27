// ============================================================
// Admin notification badge counts — SERVER-ONLY.
//
// One source of truth for "how many things on this admin tab need an admin to do
// something". Consumed by the /admin layout (initial server render, so badges are
// correct on first paint with no flash) and by GET /api/admin/badges (the
// client-side refresh after an action).
//
// THE RULE: a badge counts OPEN WORK, never history. Every count below is a
// queue an admin drains — an item leaves the count precisely when an admin (or
// the creator, where the ball is theirs) has acted on it. Terminal states
// (approved / rejected / resolved / paid / completed / cancelled / refunded) are
// history and are never counted, which is what lets a badge actually reach zero
// and disappear.
//
// Tabs with no work queue get NO badge and no key here: Overview and Finance are
// dashboards over historical data; Payments is provider configuration; Users is a
// directory + role management. The KYC/verification queue is counted once, on the
// Verifications tab where the review actually happens — deliberately not mirrored
// onto Users, because showing the same number twice would read as twice the work.
//
// Efficiency: every count is a PostgREST `head: true` exact count — the server
// returns a row count and NO rows, so nothing is transferred or deserialized.
// All of them run concurrently in one Promise.all, hitting existing indexes
// (idx_campaigns_status, idx_payout_status, campaign_flags_status_idx,
// idx_contact_unread, idx_donations_status). No new table, column, view, RPC or
// index — and no migration.
//
// Resilience: each count is individually wrapped, so a table belonging to a
// migration that has not been applied yet (extension requests, completion
// reports) returns 0 instead of breaking the whole admin nav.
// ============================================================

import { createAdminClient } from '@/lib/supabase/admin';
import {
  PENDING_PAYMENT_GRACE_MINUTES,
  PENDING_PAYMENT_LOOKBACK_DAYS,
} from '@/lib/payments/reconcile-click';
import { EMPTY_ADMIN_BADGE_COUNTS, type AdminBadgeCounts } from '@/lib/admin/badge-counts';

// The count SHAPE lives in lib/admin/badge-counts.ts because the nav and its
// provider are Client Components: this module must not be reachable from the
// browser bundle (it imports the service-role client). Re-exported here so
// server-side callers have a single import.
export { EMPTY_ADMIN_BADGE_COUNTS };
export type { AdminBadgeCounts };

/**
 * Withdrawal statuses that still need an ADMIN to act:
 *   • pending_review — needs the approve/reject decision
 *   • approved       — approved but not yet transferred; an admin still owes the
 *                      payout and must mark it paid. Money owed is open work.
 * Deliberately excluded: `info_requested` (waiting on the CREATOR to reply, not
 * on us) and the terminal `paid` / `rejected` / `cancelled`.
 */
export const ACTIONABLE_PAYOUT_STATUSES = ['pending_review', 'approved'] as const;

/**
 * A count that can never break the admin nav. Any failure — missing table from an
 * unapplied migration, RLS surprise, network — yields 0 rather than throwing.
 */
async function safeCount(run: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count, error } = await run();
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Every actionable count for the admin nav, fetched concurrently.
 *
 * Uses the service-role client: these are counts of rows an admin is entitled to
 * see, and the callers are both admin-gated (the /admin layout re-checks role,
 * and /api/admin/badges calls requireAdmin) — so RLS is not the boundary here,
 * the caller is. No row data leaves the DB, only counts.
 */
export async function getAdminBadgeCounts(): Promise<AdminBadgeCounts> {
  try {
    const admin = createAdminClient();
    const now = Date.now();

    // "Stuck payment" window — the SAME definition the Click reconciliation
    // sweep uses (lib/payments/reconcile-click.ts), so the badge and the admin
    // alerting agree. Younger than the grace period = still mid-checkout, not a
    // problem yet. Older than the lookback = an abandoned checkout, which is
    // history and needs nothing (pending never counts toward any total).
    // Terminal `failed` donations are excluded for the same reason: the payment
    // simply did not happen, there is nothing for an admin to do, and they stay
    // fully visible in the /admin/donations history.
    const stuckNotBefore = new Date(now - PENDING_PAYMENT_LOOKBACK_DAYS * 86_400_000).toISOString();
    const stuckNotAfter = new Date(now - PENDING_PAYMENT_GRACE_MINUTES * 60_000).toISOString();

    const [campaigns, extensions, reports, donations, verifications, flags, payouts, messages] =
      await Promise.all([
        // Pending Review campaigns.
        safeCount(() =>
          admin
            .from('campaigns')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        ),
        // Extension requests awaiting a decision.
        safeCount(() =>
          admin
            .from('campaign_extension_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        ),
        // Completion reports awaiting moderation.
        safeCount(() =>
          admin
            .from('campaign_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        ),
        // Payments stuck pending inside the attention window.
        safeCount(() =>
          admin
            .from('donations')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
            .gte('created_at', stuckNotBefore)
            .lte('created_at', stuckNotAfter)
        ),
        // KYC requests awaiting review.
        safeCount(() =>
          admin
            .from('verification_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        ),
        // Unresolved abuse flags.
        safeCount(() =>
          admin
            .from('campaign_flags')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        ),
        // Withdrawals needing review or execution.
        safeCount(() =>
          admin
            .from('payout_requests')
            .select('*', { count: 'exact', head: true })
            .in('status', ACTIONABLE_PAYOUT_STATUSES as unknown as string[])
        ),
        // Unread complaints / contact messages.
        safeCount(() =>
          admin
            .from('contact_messages')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
        ),
      ]);

    return { campaigns, extensions, reports, donations, verifications, flags, payouts, messages };
  } catch {
    return EMPTY_ADMIN_BADGE_COUNTS;
  }
}
