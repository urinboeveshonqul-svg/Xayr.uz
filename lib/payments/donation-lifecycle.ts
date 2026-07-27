// ============================================================
// Donation lifecycle — the single source of truth for what each status MEANS,
// which ones need an admin, and how long a pending payment stays active.
//
// CLIENT-SAFE: pure constants and predicates, no DB client, no env-only secrets.
// The sweep that actually writes 'expired' lives in lib/payments/expiry.ts
// (server-only); this module is what the admin badge, the admin UI and the tests
// all read so they can never disagree about the rules.
//
//   pending    → waiting for the provider callback. The ONLY actionable state.
//   completed  → paid + credited (apply_donation() ran). Terminal for money in.
//   failed     → provider reported failure, or a definitive amount/currency
//                mismatch. Never credited. Also where a provider-side
//                CANCELLATION is currently recorded (see `cancelled` below).
//   cancelled  → reserved lifecycle state, representable and filterable. The
//                Click/Payme routes still write 'failed' for a provider cancel
//                because financial reporting counts failed_payments_* off
//                'failed'; splitting it silently would under-report. Making the
//                split later is a one-line change.
//   expired    → no successful callback within DONATION_EXPIRY_HOURS. An
//                abandoned checkout. NOT terminal for crediting: a verified late
//                callback can still complete it (lib/payments/confirm.ts).
//   refunded   → was completed, then reversed. apply_donation() has already
//                debited the campaign. Never re-completable.
// ============================================================

import type { DonationStatus } from '@/types';

/** Default window a pending donation stays active before the sweep expires it. */
export const DEFAULT_DONATION_EXPIRY_HOURS = 72;

/**
 * A pending donation younger than this is simply mid-checkout — the donor may
 * still be on the provider's page — so it is not yet "waiting on an admin".
 * Mirrors the Click reconciliation sweep's grace period for the same reason.
 */
export const DONATION_PENDING_GRACE_MINUTES = 15;

/**
 * Every status a donation row may hold. Mirrors the donations_status_check
 * constraint widened by supabase/donation-expiry.sql (#62).
 */
export const DONATION_STATUSES = [
  'pending',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'refunded',
] as const satisfies readonly DonationStatus[];

/**
 * Statuses from which a VERIFIED provider callback may still credit a donation.
 *
 * 'expired' is included deliberately: expiry is a housekeeping label, not a
 * refusal to accept money. If a provider captured the payment and its callback
 * arrives late (or is retried days later), that payment must still land. Because
 * apply_donation() credits on any transition INTO 'completed', a late
 * expired → completed credits campaign totals, donor count, the ledger and the
 * owner notification exactly once.
 *
 * Everything else is excluded on purpose:
 *   completed → already credited (a duplicate callback must be a no-op)
 *   refunded  → money already returned; re-completing would double-credit
 *   failed / cancelled → a definitive negative outcome, including an
 *                        amount/currency mismatch that must never credit
 */
export const COMPLETABLE_STATUSES = ['pending', 'expired'] as const;

/** Can a verified callback still finalize this donation? */
export function isCompletable(status: string): boolean {
  return (COMPLETABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Statuses that require an admin to look at them. Exactly one — 'pending'.
 * Completed / failed / cancelled / expired / refunded are all history: they are
 * kept forever and stay searchable, but they are never open work, which is what
 * lets the admin badge reach zero.
 */
export const ACTIONABLE_DONATION_STATUSES = ['pending'] as const;

/** Does this status belong in the admin queue / badge count? */
export function isActionableDonation(status: string): boolean {
  return (ACTIONABLE_DONATION_STATUSES as readonly string[]).includes(status);
}

/**
 * The configured expiry window in hours, read from the server-side
 * DONATION_EXPIRY_HOURS env var (default 72).
 *
 * Invalid input — non-numeric, zero, negative, non-finite — falls back to the
 * default rather than throwing: a typo in an env var must never turn the sweep
 * into something that expires everything instantly. Values are floored to whole
 * hours.
 *
 * PROVIDER COMPATIBILITY (why 72h is safe for both gateways):
 *   • Payme's own transaction lifetime is 12h (PAYME_TRANSACTION_TIMEOUT_MS);
 *     the route already refuses to create a transaction older than that. 72h is
 *     6× longer, so Payme has abandoned the transaction long before we expire
 *     the donation — we can never expire one Payme still considers payable.
 *   • Click's reconciliation sweep chases pending Click payments for 3 days
 *     (PENDING_PAYMENT_LOOKBACK_DAYS = 72h). Expiry lands exactly where we stop
 *     chasing, so no donation is expired while still being reconciled.
 *   • Either way a late callback still completes the donation, so even a
 *     misconfigured (too short) window cannot lose a payment.
 */
export function donationExpiryHours(): number {
  const raw = process.env.DONATION_EXPIRY_HOURS;
  if (raw == null || raw.trim() === '') return DEFAULT_DONATION_EXPIRY_HOURS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DONATION_EXPIRY_HOURS;
  return Math.floor(parsed);
}

/**
 * The ISO cutoff for expiry: a pending donation created strictly BEFORE this
 * instant is abandoned. Exposed (with an injectable `now`) so the sweep, the
 * badge and the tests all derive the boundary the same way.
 */
export function expiryCutoffIso(now: number = Date.now(), hours: number = donationExpiryHours()): string {
  return new Date(now - hours * 3_600_000).toISOString();
}

/**
 * Whether a pending donation created at `createdAt` is abandoned as of `now`.
 * Pure — this is the rule the tests pin down.
 */
export function isAbandonedPending(
  status: string,
  createdAt: string | null | undefined,
  now: number = Date.now(),
  hours: number = DEFAULT_DONATION_EXPIRY_HOURS,
): boolean {
  // Only a pending donation can be abandoned. A completed / failed / cancelled /
  // expired / refunded donation is already resolved and must never be touched.
  if (status !== 'pending') return false;
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return created < now - hours * 3_600_000;
}
