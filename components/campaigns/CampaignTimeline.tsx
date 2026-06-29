'use client';

import { CalendarClock } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export interface TimelineExtension {
  approved_at: string | null;
  new_deadline: string;
}

/**
 * Public lifecycle timeline for a campaign. Surfaced when a campaign has been
 * extended so anyone can see Created → Extended (date)… → terminal state.
 * Only non-sensitive dates are shown (the extension reason is never exposed).
 */
export function CampaignTimeline({
  createdAt,
  status,
  extensions,
  locale,
}: {
  createdAt: string;
  status: string;
  extensions: TimelineExtension[];
  locale: string;
}) {
  const { t } = useI18n();

  const monthYear = (s: string) => new Date(s).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const day = (s: string) => new Date(s).toLocaleDateString(locale);

  const items: { label: string; sub: string | null }[] = [
    { label: t('detail.tlCreated'), sub: day(createdAt) },
    ...extensions.map((e) => {
      const when = e.approved_at ?? e.new_deadline;
      return { label: `${t('detail.tlExtended')} (${monthYear(when)})`, sub: e.approved_at ? day(e.approved_at) : null };
    }),
  ];

  if (status === 'funded' || status === 'completed') items.push({ label: t('detail.tlCompleted'), sub: null });
  else if (status === 'expired') items.push({ label: t('detail.tlEnded'), sub: null });
  else if (status === 'active') items.push({ label: t('detail.tlActive'), sub: null });

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-brand-600" />
        {t('detail.timelineTitle')}
      </h2>
      <ol className="relative ml-2 border-l-2 border-gray-100 dark:border-gray-800 space-y-4">
        {items.map((it, i) => (
          <li key={i} className="ml-4">
            <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{it.label}</p>
            {it.sub && <p className="text-xs text-gray-400">{it.sub}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
