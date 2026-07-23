/**
 * Campaign creation/edit limits — the single source of truth shared by the
 * client forms (instant feedback + input constraints), the server create route,
 * and mirrored by the DB trigger (supabase/campaign-limits.sql). Pure/isomorphic
 * so it can be unit-tested and imported anywhere.
 */

/** Maximum fundraising goal in UZS (so'm). */
export const MAX_GOAL_AMOUNT = 1_000_000_000;

/** Maximum campaign duration, in days from the creation date. */
export const MAX_DURATION_DAYS = 60;

/** Goal must be a positive amount not exceeding the cap. */
export function isGoalWithinLimit(goal: number): boolean {
  return Number.isFinite(goal) && goal > 0 && goal <= MAX_GOAL_AMOUNT;
}

// Calendar day (UTC) of a Date as YYYY-MM-DD.
function toISODate(from: Date): string {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** Today's date (YYYY-MM-DD), for the date picker `min`. */
export function todayISO(from: Date = new Date()): string {
  return toISODate(from);
}

/** The latest allowed end date (YYYY-MM-DD), for the date picker `max`. */
export function maxDeadlineISO(from: Date = new Date()): string {
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + MAX_DURATION_DAYS);
  return base.toISOString().slice(0, 10);
}

/**
 * A `YYYY-MM-DD` end date is within limit when it is a real calendar date, is not
 * before today, and is at most MAX_DURATION_DAYS after `from` (the creation date;
 * `now` for a new campaign, the campaign's `created_at` when editing).
 */
export function isDurationWithinLimit(deadline: string, from: Date = new Date()): boolean {
  if (typeof deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
  const [y, m, d] = deadline.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject non-existent dates (e.g. 2026-02-30 rolls over to March).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  // YYYY-MM-DD strings compare chronologically.
  return deadline >= todayISO(from) && deadline <= maxDeadlineISO(from);
}
