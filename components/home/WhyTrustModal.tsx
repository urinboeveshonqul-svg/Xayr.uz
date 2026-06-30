'use client';

import { useEffect, useRef, type ComponentType } from 'react';
import Link from 'next/link';
import {
  X, ShieldCheck, Lock, Wallet, ClipboardCheck, Percent, EyeOff, Flag,
  CheckCircle2, HelpCircle, MessageCircle, ArrowRight,
} from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney } from '@/lib/utils';

/** Real platform counts; any value <= 0 is treated as unavailable and hidden. */
export interface TrustStats {
  verifiedCampaigns: number;
  successfulCampaigns: number;
  donations: number;
  registeredUsers: number;
  raised: number;
}

type IconType = ComponentType<{ className?: string }>;

/**
 * "Why Trust XAYR?" — the trust & transparency explainer. Bottom-sheet on mobile,
 * centered modal on desktop (same pattern as ShareModal). Loaded lazily by
 * WhyTrustButton so its weight stays out of the homepage's initial bundle.
 */
export default function WhyTrustModal({
  stats,
  onClose,
}: {
  stats: TrustStats;
  onClose: () => void;
}) {
  const { t, ta, locale } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc to close, focus trap (Tab cycling), initial focus, scroll lock, and
  // focus restoration to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const sections: {
    Icon: IconType;
    title: string;
    intro?: string;
    points: string[];
    outro?: string;
  }[] = [
    { Icon: ShieldCheck, title: t('trust.s1Title'), points: ta('trust.s1Points') },
    { Icon: Lock, title: t('trust.s2Title'), points: ta('trust.s2Points') },
    { Icon: Wallet, title: t('trust.s3Title'), points: ta('trust.s3Points') },
    {
      Icon: ClipboardCheck,
      title: t('trust.s4Title'),
      intro: t('trust.s4Intro'),
      points: ta('trust.s4Points'),
      outro: t('trust.s4Outro'),
    },
    // Platform fees reuse the existing transparency copy (single source of truth).
    {
      Icon: Percent,
      title: t('trust.s5Title'),
      intro: t('transparency.feeBody'),
      points: ta('transparency.feeItems'),
    },
    { Icon: EyeOff, title: t('trust.s6Title'), points: ta('trust.s6Points') },
    {
      Icon: Flag,
      title: t('trust.s7Title'),
      intro: t('trust.s7Intro'),
      points: ta('trust.s7Points'),
      outro: t('trust.s7Outro'),
    },
  ];

  // Real data only; hide any value that isn't available (<= 0).
  const indicators = [
    { value: stats.verifiedCampaigns, label: t('transparency.statVerifiedCampaigns'), money: false },
    { value: stats.successfulCampaigns, label: t('transparency.statSuccessful'), money: false },
    { value: stats.donations, label: t('trust.statDonations'), money: false },
    { value: stats.registeredUsers, label: t('trust.statUsers'), money: false },
    { value: stats.raised, label: t('transparency.statRaised'), money: true },
  ].filter((i) => i.value > 0);

  const ctas: { href: string; label: string; Icon: IconType }[] = [
    { href: `/${locale}/guide`, label: t('trust.ctaHelp'), Icon: HelpCircle },
    { href: `/${locale}/contact`, label: t('trust.ctaContact'), Icon: MessageCircle },
    { href: `/${locale}/fees`, label: t('trust.ctaFees'), Icon: Percent },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trust-modal-title"
        aria-describedby="trust-modal-sub"
        className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-pop flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (sticky) */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 id="trust-modal-title" className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" aria-hidden="true" />
              {t('trust.title')}
            </h2>
            <p id="trust-modal-sub" className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {t('trust.subtitle')}
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t('ux.close')}
            className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="overflow-y-auto px-5 sm:px-7 py-5 space-y-4"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {/* Trust indicators — real platform data only; hidden when nothing is available */}
          {indicators.length > 0 && (
            <section
              aria-label={t('trust.statsTitle')}
              className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 p-4"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
                {indicators.map((ind, i) => (
                  <div key={i} className="text-center">
                    <div className="text-lg sm:text-xl font-black text-gray-900 dark:text-white break-words">
                      {ind.money ? `${formatMoney(ind.value)} so'm` : ind.value.toLocaleString('uz-UZ')}
                    </div>
                    <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">
                      {ind.label}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sections */}
          {sections.map(({ Icon, title, intro, points, outro }, i) => (
            <section
              key={i}
              className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 p-5"
            >
              <h3 className="font-black text-gray-900 dark:text-white mb-2.5 flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-green-600" aria-hidden="true" />
                </span>
                {title}
              </h3>
              {intro && (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{intro}</p>
              )}
              {points.length > 0 && (
                <ul className="space-y-2">
                  {points.map((point, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}
              {outro && (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-3">{outro}</p>
              )}
            </section>
          ))}

          {/* CTA */}
          <section className="rounded-2xl border border-green-100 dark:border-green-900/30 bg-green-50/60 dark:bg-green-900/10 p-5 text-center">
            <p className="font-black text-gray-900 dark:text-white mb-4">{t('trust.ctaTitle')}</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 sm:justify-center">
              {ctas.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-green-500 hover:text-green-600 transition-colors"
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                  <ArrowRight className="w-4 h-4 opacity-60" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
