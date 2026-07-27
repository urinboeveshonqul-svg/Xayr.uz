import { createAdminClient } from '@/lib/supabase/admin';
import type { DonationStatus } from '@/types';
import { donationExpiryHours, expiryCutoffIso } from './donation-lifecycle';

// ============================================================
// Abandoned-donation expiry sweep. SERVER-ONLY.
//
// A donor who opens a payment page and closes it without paying leaves a
// 'pending' donation behind. Nothing ever resolved those rows, so they piled up
// in the admin queue and grew the admin nav badge without bound. This sweep
// relabels them: pending + older than DONATION_EXPIRY_HOURS (default 72h) →
// 'expired'.
//
// WHAT IT DOES NOT DO — the safety envelope:
//   • Never DELETES anything. Expiry is a status change; the row, its amount, its
//     donor contact, its payment_ref and its payment_events all remain intact for
//     audit history, fraud investigation, troubleshooting and analytics.
//   • Never moves money. apply_donation() credits only on a transition INTO
//     'completed' and reverses only on a transition OUT of it, so
//     pending → expired leaves current_amount, donors_count, the ledger, payout
//     balances and receipts untouched.
//   • Never closes the door on a real payment. 'expired' stays in
//     COMPLETABLE_STATUSES, so a verified late callback still credits the
//     donation exactly once (lib/payments/confirm.ts).
//   • Never touches a resolved donation. The UPDATE re-asserts status='pending',
//     so completed / failed / cancelled / refunded / already-expired rows are
//     unreachable — and a payment that completes mid-sweep is not clobbered,
//     because the row no longer matches the predicate.
//
// PERFORMANCE: one UPDATE with `status='pending' and created_at < cutoff`, served
// by the partial index idx_donations_pending_created (#62) which contains only
// pending rows. No table scan, and the indexed set shrinks every time the sweep
// runs. Work is bounded per invocation (MAX_PER_RUN) so a large first-run backlog
// drains over successive days instead of one long transaction.
// ============================================================

/** Upper bound on rows relabelled per invocation, so no run is unbounded. */
const MAX_PER_RUN = 500;

export interface ExpireDonationsResult {
  /** Rows moved pending → expired this run. */
  expired: number;
  /** The cutoff used — anything pending created before this is abandoned. */
  cutoff: string;
  /** The window actually applied, for log/audit clarity. */
  expiryHours: number;
  /** True when MAX_PER_RUN was hit and a backlog remains for the next run. */
  moreRemaining: boolean;
  durationMs: number;
}

/**
 * Relabel abandoned pending donations as 'expired'.
 *
 * Never throws for normal data conditions: a DB error is reported as 0 expired so
 * the cron endpoint can log it without a 500 storm. Safe to run repeatedly and
 * concurrently — the status predicate makes it idempotent.
 */
export async function expireAbandonedDonations(): Promise<ExpireDonationsResult> {
  const startedAt = Date.now();
  const expiryHours = donationExpiryHours();
  const cutoff = expiryCutoffIso(startedAt, expiryHours);
  const base: ExpireDonationsResult = {
    expired: 0,
    cutoff,
    expiryHours,
    moreRemaining: false,
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    // Select the ids first, bounded, so the UPDATE can never exceed MAX_PER_RUN.
    // Oldest first: the most abandoned rows drain first if there is a backlog.
    const { data: due, error: selectErr } = await admin
      .from('donations')
      .select('id')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(MAX_PER_RUN);

    if (selectErr || !due || due.length === 0) {
      return { ...base, durationMs: Date.now() - startedAt };
    }

    // Re-assert status='pending' in the UPDATE itself: between the select and
    // here, a provider callback may have completed one of these donations, and
    // that payment must win.
    const { data: updated, error: updateErr } = await admin
      .from('donations')
      .update({ status: 'expired' as DonationStatus })
      .in(
        'id',
        due.map((d) => d.id),
      )
      .eq('status', 'pending')
      .select('id');

    if (updateErr) {
      return { ...base, durationMs: Date.now() - startedAt };
    }

    return {
      ...base,
      expired: updated?.length ?? 0,
      moreRemaining: due.length === MAX_PER_RUN,
      durationMs: Date.now() - startedAt,
    };
  } catch {
    return { ...base, durationMs: Date.now() - startedAt };
  }
}
