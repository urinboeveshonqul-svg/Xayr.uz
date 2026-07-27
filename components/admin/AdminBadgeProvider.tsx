'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ADMIN_MUTATION_EVENT } from '@/lib/admin/badge-events';
// Client-safe shape module — NOT lib/admin/badges.ts, which builds the counts
// with the service-role client and must never enter the browser bundle.
import { EMPTY_ADMIN_BADGE_COUNTS, type AdminBadgeCounts } from '@/lib/admin/badge-counts';

// ============================================================
// Holds the live admin badge counts.
//
// Seeded with counts computed during the /admin layout's server render, so the
// badges are already correct on first paint — no zero-then-pop flash and no
// fetch needed just to display the page.
//
// After that they refresh on their own when:
//   • an admin action fires ADMIN_MUTATION_EVENT (the main path — badges update
//     immediately after approve/reject/resolve/mark-read, no page reload)
//   • the tab regains focus or visibility (another admin, or another tab of
//     yours, may have drained a queue in the meantime)
//
// There is deliberately NO polling: the admin panel is not a dashboard people
// leave open to watch, and an interval would keep hitting the DB for nothing.
// ============================================================

interface AdminBadgeValue {
  counts: AdminBadgeCounts;
  /** Force a refetch. Rarely needed directly — prefer notifyAdminMutation(). */
  refresh: () => void;
}

const AdminBadgeContext = createContext<AdminBadgeValue>({
  counts: EMPTY_ADMIN_BADGE_COUNTS,
  refresh: () => {},
});

/** Coalesce bursts (e.g. resolving several rows quickly) into one request. */
const REFRESH_DEBOUNCE_MS = 300;

export function AdminBadgeProvider({
  initialCounts,
  children,
}: {
  initialCounts: AdminBadgeCounts;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = useState<AdminBadgeCounts>(initialCounts);

  // Keep the server-rendered numbers authoritative on navigation between admin
  // tabs: the layout re-renders with fresh counts, so adopt them.
  useEffect(() => {
    setCounts(initialCounts);
  }, [initialCounts]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      inFlight.current?.abort();
    };
  }, []);

  const fetchCounts = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const res = await fetch('/api/admin/badges', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) return; // 401/403 after a session change — keep what we have
      const data = (await res.json()) as Partial<AdminBadgeCounts>;
      if (!alive.current || controller.signal.aborted) return;
      // Merge onto the empty shape so a missing key reads as 0 (badge hidden)
      // rather than undefined leaking into the UI.
      setCounts({ ...EMPTY_ADMIN_BADGE_COUNTS, ...data });
    } catch {
      /* aborted or offline — the badges simply keep their last known values */
    }
  }, []);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void fetchCounts();
    }, REFRESH_DEBOUNCE_MS);
  }, [fetchCounts]);

  useEffect(() => {
    const onMutation = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener(ADMIN_MUTATION_EVENT, onMutation);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(ADMIN_MUTATION_EVENT, onMutation);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return (
    <AdminBadgeContext.Provider value={{ counts, refresh }}>{children}</AdminBadgeContext.Provider>
  );
}

/**
 * Live admin badge counts. Falls back to all-zero (every badge hidden) when used
 * outside the provider, so it can never throw inside the nav.
 */
export function useAdminBadges(): AdminBadgeValue {
  return useContext(AdminBadgeContext);
}
