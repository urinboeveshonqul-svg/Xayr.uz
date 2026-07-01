'use client';

import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Premium "Verified Success Story" trust badge — signals a campaign reached its
 * goal, completed fundraising, and published an admin-APPROVED completion report.
 * Shows a tooltip on hover (desktop) or tap (mobile).
 *
 * It's interactive (button + tooltip), so it must NOT be nested inside an
 * <a>/<Link> (invalid HTML). Place it as an absolutely-positioned sibling over
 * the card's cover instead.
 */
export function VerifiedSuccessBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        // Tap (mobile) toggles; don't let it trigger the card link underneath.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        aria-label={t('home.verifiedBadge')}
        aria-expanded={open}
        className="inline-flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-xs font-black shadow-md ring-1 ring-amber-300/60 whitespace-nowrap"
      >
        <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        {t('home.verifiedBadge')}
      </button>
      <span
        role="tooltip"
        className={`absolute left-0 top-full mt-2 w-56 max-w-[70vw] z-30 rounded-xl bg-gray-900 text-white text-[11px] font-medium leading-snug p-2.5 shadow-xl transition-opacity duration-150 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {t('home.verifiedTooltip')}
      </span>
    </span>
  );
}
