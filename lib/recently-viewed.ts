'use client';

// Guest recently-viewed list (logged-in users use the DB instead).
// Ordered most-recent-first, deduped, capped.
const KEY = 'xayr_recent';
const CAP = 10;

/** Move a campaign to the top of the guest recency list (dedup, cap 10). */
export function addRecent(campaignId: string): void {
  try {
    const next = [campaignId, ...getRecentIds().filter((id) => id !== campaignId)].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable (private mode) — ignore */
  }
}

/** Read the guest recency list (most-recent-first). */
export function getRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
