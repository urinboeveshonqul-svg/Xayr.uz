// ============================================================
// Admin badge count SHAPE — CLIENT-SAFE.
//
// Deliberately separate from lib/admin/badges.ts: that module builds the counts
// with the service-role Supabase client and is SERVER-ONLY (it must never reach
// the browser — see lib/supabase/admin.ts). The nav and its provider are Client
// Components and need the type plus a zero value at runtime, so those live here
// where importing them pulls in nothing but this file.
//
// What each count means, and why a tab does or does not have one, is documented
// in lib/admin/badges.ts alongside the queries that produce them.
// ============================================================

/**
 * Open-work counts, keyed by admin nav tab. Keys map 1:1 to the badge-carrying
 * tabs in AdminNav; a tab absent from this type intentionally has no badge.
 */
export interface AdminBadgeCounts {
  /** Campaigns awaiting review before they can go live. */
  campaigns: number;
  /** Deadline-extension requests awaiting an approve/reject decision. */
  extensions: number;
  /** Completion reports awaiting moderation. */
  reports: number;
  /** Payments stuck pending long enough to need a human check. */
  donations: number;
  /** KYC / identity verification requests awaiting review. */
  verifications: number;
  /** Abuse flags not yet resolved. */
  flags: number;
  /** Withdrawal requests awaiting review or awaiting payout execution. */
  payouts: number;
  /** Unread contact messages / complaints. */
  messages: number;
}

/** All zero — every badge hidden. The fallback whenever counts are unavailable. */
export const EMPTY_ADMIN_BADGE_COUNTS: AdminBadgeCounts = {
  campaigns: 0,
  extensions: 0,
  reports: 0,
  donations: 0,
  verifications: 0,
  flags: 0,
  payouts: 0,
  messages: 0,
};

/** Above this a badge shows "99+" rather than a number that would stretch the tab. */
export const BADGE_MAX_DISPLAY = 99;

/**
 * Whether a badge renders at all. Zero means "no open work", and the badge's
 * ABSENCE is how that is communicated — so this is false for 0, for negatives,
 * and for any non-finite value that a bad payload could produce.
 */
export function shouldShowBadge(count: number): boolean {
  return Number.isFinite(count) && count > 0;
}

/**
 * The text inside a badge. Clamps to "99+" so a large queue cannot widen a nav
 * tab off-screen on mobile. Fractional inputs are floored — a count is a count.
 */
export function formatBadgeCount(count: number, max: number = BADGE_MAX_DISPLAY): string {
  const whole = Math.floor(count);
  return whole > max ? `${max}+` : String(whole);
}
