import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_DONATION_EXPIRY_HOURS,
  DONATION_STATUSES,
  COMPLETABLE_STATUSES,
  ACTIONABLE_DONATION_STATUSES,
  isCompletable,
  isActionableDonation,
  isAbandonedPending,
  donationExpiryHours,
  expiryCutoffIso,
} from '@/lib/payments/donation-lifecycle';
import { PAYME_TRANSACTION_TIMEOUT_MS } from '@/lib/payments/providers/payme';
import { PENDING_PAYMENT_LOOKBACK_DAYS } from '@/lib/payments/reconcile-click';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-07-27T12:00:00Z');
/** A pending donation created `h` hours before NOW. */
const agedHours = (h: number) => new Date(NOW - h * HOUR).toISOString();

afterEach(() => {
  delete process.env.DONATION_EXPIRY_HOURS;
});

describe('expiry window configuration', () => {
  it('defaults to 72 hours', () => {
    expect(DEFAULT_DONATION_EXPIRY_HOURS).toBe(72);
    expect(donationExpiryHours()).toBe(72);
  });

  it('is configurable server-side via DONATION_EXPIRY_HOURS', () => {
    process.env.DONATION_EXPIRY_HOURS = '24';
    expect(donationExpiryHours()).toBe(24);
    process.env.DONATION_EXPIRY_HOURS = '168';
    expect(donationExpiryHours()).toBe(168);
  });

  it('falls back to the default on garbage rather than expiring everything', () => {
    // A typo must never become "expire every pending donation immediately".
    for (const bad of ['', '   ', 'abc', '0', '-5', 'NaN', 'Infinity']) {
      process.env.DONATION_EXPIRY_HOURS = bad;
      expect(donationExpiryHours()).toBe(DEFAULT_DONATION_EXPIRY_HOURS);
    }
  });

  it('floors fractional hours', () => {
    process.env.DONATION_EXPIRY_HOURS = '48.9';
    expect(donationExpiryHours()).toBe(48);
  });

  it('derives a cutoff exactly `hours` before now', () => {
    expect(expiryCutoffIso(NOW, 72)).toBe(new Date(NOW - 72 * HOUR).toISOString());
  });
});

describe('provider compatibility of the 72h window', () => {
  // "Verify that this timeout is compatible with Click and Payme payment flows."
  it('is longer than Payme’s own 12h transaction lifetime', () => {
    // Payme refuses to CREATE a transaction older than 12h, so it has abandoned
    // the transaction long before we expire the donation. We can therefore never
    // expire a donation Payme still considers payable.
    const paymeHours = PAYME_TRANSACTION_TIMEOUT_MS / HOUR;
    expect(paymeHours).toBe(12);
    expect(DEFAULT_DONATION_EXPIRY_HOURS).toBeGreaterThan(paymeHours);
  });

  it('matches how long Click payments are reconciled for', () => {
    // Click's reconciliation sweep chases pending payments for 3 days; expiry
    // lands exactly where we stop chasing, so nothing is expired mid-reconcile.
    expect(PENDING_PAYMENT_LOOKBACK_DAYS * 24).toBe(DEFAULT_DONATION_EXPIRY_HOURS);
  });
});

describe('isAbandonedPending — pending expires after 72 hours', () => {
  it('does NOT expire a pending donation younger than the window', () => {
    for (const h of [0, 1, 12, 24, 71, 71.9]) {
      expect(isAbandonedPending('pending', agedHours(h), NOW)).toBe(false);
    }
  });

  it('expires a pending donation older than the window', () => {
    for (const h of [72.1, 73, 100, 24 * 30]) {
      expect(isAbandonedPending('pending', agedHours(h), NOW)).toBe(true);
    }
  });

  it('treats exactly-72h-old as not yet abandoned (strict boundary)', () => {
    expect(isAbandonedPending('pending', agedHours(72), NOW)).toBe(false);
  });

  it('honours a custom window', () => {
    expect(isAbandonedPending('pending', agedHours(30), NOW, 24)).toBe(true);
    expect(isAbandonedPending('pending', agedHours(30), NOW, 48)).toBe(false);
  });

  it('never expires a COMPLETED donation, however old', () => {
    expect(isAbandonedPending('completed', agedHours(24 * 365), NOW)).toBe(false);
  });

  it('never expires failed / cancelled / refunded / already-expired donations', () => {
    for (const status of ['failed', 'cancelled', 'refunded', 'expired']) {
      expect(isAbandonedPending(status, agedHours(24 * 365), NOW)).toBe(false);
    }
  });

  it('is safe with a missing or unparseable created_at', () => {
    expect(isAbandonedPending('pending', null, NOW)).toBe(false);
    expect(isAbandonedPending('pending', undefined, NOW)).toBe(false);
    expect(isAbandonedPending('pending', 'not-a-date', NOW)).toBe(false);
  });
});

describe('admin queue + notification badge count only ACTIVE pending', () => {
  it('pending is the only actionable status', () => {
    expect(ACTIONABLE_DONATION_STATUSES).toEqual(['pending']);
    expect(isActionableDonation('pending')).toBe(true);
  });

  it('the badge ignores expired donations', () => {
    expect(isActionableDonation('expired')).toBe(false);
  });

  it('the badge ignores every non-pending status', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'expired', 'refunded']) {
      expect(isActionableDonation(status)).toBe(false);
    }
  });

  it('an expired donation disappears from the admin queue once swept', () => {
    // Before the sweep an old pending row is (technically) still actionable;
    // after it is relabelled 'expired' it drops out of the queue entirely.
    const old = agedHours(100);
    expect(isAbandonedPending('pending', old, NOW)).toBe(true);
    expect(isActionableDonation('expired')).toBe(false);
  });
});

describe('completable set — late webhooks and no double credits', () => {
  it('pending and expired are completable', () => {
    expect(COMPLETABLE_STATUSES).toEqual(['pending', 'expired']);
    expect(isCompletable('pending')).toBe(true);
    expect(isCompletable('expired')).toBe(true);
  });

  it('a completed donation is NOT completable, so a duplicate callback cannot re-credit', () => {
    expect(isCompletable('completed')).toBe(false);
  });

  it('refunded / failed / cancelled are never re-completable', () => {
    for (const status of ['refunded', 'failed', 'cancelled']) {
      expect(isCompletable(status)).toBe(false);
    }
  });

  it('failed and cancelled never return to pending', () => {
    // There is no transition back: neither is completable, and neither can be
    // picked up by the expiry sweep (which only ever reads 'pending').
    for (const status of ['failed', 'cancelled']) {
      expect(isCompletable(status)).toBe(false);
      expect(isAbandonedPending(status, agedHours(1_000), NOW)).toBe(false);
      expect(isActionableDonation(status)).toBe(false);
    }
  });
});

describe('lifecycle status set', () => {
  it('covers every state in the documented lifecycle', () => {
    expect([...DONATION_STATUSES].sort()).toEqual([
      'cancelled',
      'completed',
      'expired',
      'failed',
      'pending',
      'refunded',
    ]);
  });

  it('every completable and actionable status is a real lifecycle status', () => {
    const all = DONATION_STATUSES as readonly string[];
    for (const s of COMPLETABLE_STATUSES) expect(all).toContain(s);
    for (const s of ACTIONABLE_DONATION_STATUSES) expect(all).toContain(s);
  });
});
