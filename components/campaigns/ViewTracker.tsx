'use client';

import { useEffect } from 'react';

// Per-browser dedup window: a refresh within this period won't re-count.
const WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fire-and-forget view beacon. Skips the request entirely if this browser
 * already viewed the campaign recently (localStorage), so refreshes don't spam
 * the server. Owner-exclusion + rate-limiting are enforced server-side, so this
 * stays a tiny, render-null client component.
 */
export function ViewTracker({ campaignId }: { campaignId: string }) {
  useEffect(() => {
    const key = `xayr_v_${campaignId}`;
    try {
      const last = Number(localStorage.getItem(key) ?? 0);
      if (Date.now() - last < WINDOW_MS) return; // recently counted in this browser
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // localStorage unavailable (e.g. private mode) — proceed; server still
      // applies owner-exclusion + rate limiting.
    }

    void fetch('/api/campaigns/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
      keepalive: true,
    }).catch(() => {
      /* best-effort; a failed view ping must never affect the page */
    });
  }, [campaignId]);

  return null;
}
