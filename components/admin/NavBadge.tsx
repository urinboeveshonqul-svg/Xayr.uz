'use client';

import { useI18n } from '@/components/i18n/I18nProvider';
import { formatBadgeCount, shouldShowBadge } from '@/lib/admin/badge-counts';

// ============================================================
// iOS-style notification badge: a small red pill with a bold white count.
//
// Renders NOTHING at all (not an empty element, not a hidden one) when count <= 0
// — the badge's absence is the "no work here" signal, and an empty red dot would
// be a false one.
//
// Sizing is deliberately in `px`/`rem`-free Tailwind steps that hold on both
// desktop and mobile: a fixed height with `min-w` equal to it gives a perfect
// circle for single digits and grows into a pill for 2–3 characters, so the nav
// never reflows awkwardly as counts change. Counts above 99 clamp to "99+" so a
// runaway queue can't stretch a tab off-screen.
// ============================================================

export function NavBadge({ count, className = '' }: { count: number; className?: string }) {
  const { t } = useI18n();

  // The zero case is the whole point: no count, no badge. Rule lives in
  // lib/admin/badge-counts.ts so it is unit-tested rather than assumed.
  if (!shouldShowBadge(count)) return null;

  const rounded = Math.floor(count);
  const display = formatBadgeCount(count);

  return (
    <span
      // aria-live so a screen reader announces the change when an action drains
      // the queue, instead of the count silently updating.
      aria-live="polite"
      aria-label={t('admin.badgeAria', { count: rounded })}
      title={t('admin.badgeAria', { count: rounded })}
      className={`inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black leading-none tabular-nums shadow-sm ring-1 ring-white/70 dark:ring-gray-900/70 ${className}`}
    >
      {display}
    </span>
  );
}
