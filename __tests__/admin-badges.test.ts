import { describe, it, expect } from 'vitest';
import {
  shouldShowBadge,
  formatBadgeCount,
  BADGE_MAX_DISPLAY,
  EMPTY_ADMIN_BADGE_COUNTS,
  type AdminBadgeCounts,
} from '@/lib/admin/badge-counts';
import { ACTIONABLE_PAYOUT_STATUSES } from '@/lib/admin/badges';

describe('shouldShowBadge — a badge only exists when there is open work', () => {
  it('hides at exactly zero', () => {
    expect(shouldShowBadge(0)).toBe(false);
  });

  it('shows for any positive count', () => {
    for (const n of [1, 2, 7, 99, 100, 5000]) {
      expect(shouldShowBadge(n)).toBe(true);
    }
  });

  it('hides for negative counts', () => {
    expect(shouldShowBadge(-1)).toBe(false);
    expect(shouldShowBadge(-500)).toBe(false);
  });

  it('hides for non-finite values a bad payload could produce', () => {
    expect(shouldShowBadge(Number.NaN)).toBe(false);
    expect(shouldShowBadge(Number.POSITIVE_INFINITY)).toBe(false);
    expect(shouldShowBadge(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('every badge is hidden for the all-zero fallback', () => {
    for (const value of Object.values(EMPTY_ADMIN_BADGE_COUNTS)) {
      expect(shouldShowBadge(value)).toBe(false);
    }
  });

  it('transitions from shown to hidden as a queue drains to zero', () => {
    const drain = [3, 2, 1, 0];
    expect(drain.map(shouldShowBadge)).toEqual([true, true, true, false]);
  });
});

describe('formatBadgeCount', () => {
  it('renders small counts verbatim', () => {
    expect(formatBadgeCount(1)).toBe('1');
    expect(formatBadgeCount(9)).toBe('9');
    expect(formatBadgeCount(42)).toBe('42');
  });

  it('renders the boundary value without clamping', () => {
    expect(formatBadgeCount(BADGE_MAX_DISPLAY)).toBe('99');
  });

  it('clamps anything above the max so a tab cannot be stretched off-screen', () => {
    expect(formatBadgeCount(BADGE_MAX_DISPLAY + 1)).toBe('99+');
    expect(formatBadgeCount(1_000)).toBe('99+');
  });

  it('honours a custom max', () => {
    expect(formatBadgeCount(15, 9)).toBe('9+');
    expect(formatBadgeCount(5, 9)).toBe('5');
  });

  it('floors fractional counts', () => {
    expect(formatBadgeCount(3.7)).toBe('3');
  });
});

describe('AdminBadgeCounts shape', () => {
  it('covers exactly the badge-carrying admin tabs', () => {
    expect(Object.keys(EMPTY_ADMIN_BADGE_COUNTS).sort()).toEqual([
      'campaigns',
      'donations',
      'extensions',
      'flags',
      'messages',
      'payouts',
      'reports',
      'verifications',
    ]);
  });

  it('merging a partial payload onto the empty shape leaves absent keys at 0', () => {
    // Mirrors AdminBadgeProvider's merge: an incomplete response must not leak
    // `undefined` into a badge.
    const merged: AdminBadgeCounts = { ...EMPTY_ADMIN_BADGE_COUNTS, ...{ campaigns: 4 } };
    expect(merged.campaigns).toBe(4);
    expect(merged.payouts).toBe(0);
    expect(Object.values(merged).every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('ACTIONABLE_PAYOUT_STATUSES — open work only, never history', () => {
  it('counts requests awaiting an admin decision or an admin payout', () => {
    expect(ACTIONABLE_PAYOUT_STATUSES).toContain('pending_review');
    expect(ACTIONABLE_PAYOUT_STATUSES).toContain('approved');
  });

  it('excludes terminal states and requests waiting on the creator', () => {
    // paid/rejected/cancelled are history; info_requested is the creator's turn.
    for (const status of ['paid', 'rejected', 'cancelled', 'info_requested']) {
      expect(ACTIONABLE_PAYOUT_STATUSES as readonly string[]).not.toContain(status);
    }
  });
});
