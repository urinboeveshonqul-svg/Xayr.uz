'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { TrustStats } from './WhyTrustModal';

// Lazy-load the modal body — its weight stays out of the homepage's initial JS
// until the user actually opens it.
const WhyTrustModal = dynamic(() => import('./WhyTrustModal'), { ssr: false });

/**
 * Small, secondary "Why Trust XAYR?" trigger placed below the hero. Not a primary
 * CTA — it opens the trust & transparency modal without leaving the homepage.
 */
export function WhyTrustButton({ stats }: { stats: TrustStats }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] max-w-full px-5 py-2.5 rounded-full bg-white border border-gray-200 text-gray-700 text-sm font-bold shadow-sm whitespace-nowrap hover:border-green-500 hover:text-green-600 hover:shadow transition-all"
      >
        <ShieldCheck className="w-4 h-4 flex-shrink-0 text-green-600" aria-hidden="true" />
        {t('trust.button')}
      </button>
      {open && <WhyTrustModal stats={stats} onClose={() => setOpen(false)} />}
    </>
  );
}
