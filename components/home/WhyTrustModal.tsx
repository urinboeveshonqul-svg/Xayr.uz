'use client';

import {
  useEffect, useRef, useState,
  type ComponentType, type TouchEvent as ReactTouchEvent,
} from 'react';
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
 * "Why Trust XAYR?" — the trust & transparency explainer. Full-width bottom-sheet
 * on mobile (swipe-down to close), centered modal on desktop (same pattern as
 * ShareModal). Loaded lazily by WhyTrustButton so its weight stays out of the
 * homepage's initial bundle.
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

  // Swipe-down-to-close (mobile). Tracked only on the header/handle so it never
  // competes with scrolling inside the body.
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

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

  const onDragStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onDragMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setDragY(dy); // only downward drags
  };
  const onDragEnd = () => {
    if (dragY > 90) onClose();
    dragStart.current = null;
    setDragY(0);
  };

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
        className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-pop overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[88vh]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragStart.current === null ? 'transform 0.2s ease-out' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle + header = the swipe-down-to-close zone on mobile (kept off
            the scrollable body so the gesture never conflicts with scrolling). */}
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
          <div className="sm:hidden pt-3 pb-1 flex justify-center" aria-hidden="true">
            <span className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
          </div>
          <div className="flex items-start justify-between gap-3 px-4 sm:px-7 pt-3 sm:pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div className="min-w-0">
              <h2
                id="trust-modal-title"
                className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-start gap-2"
              >
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 mt-0.5 text-green-600 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0">{t('trust.title')}</span>
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
        </div>

        {/* Scrollable body — flex-1 + min-h-0 lets it shrink and scroll inside the
            sheet; overscroll-contain stops scroll chaining to the page behind. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-7 py-5 space-y-4"
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
                  <div key={i} className="text-center min-w-0">
                    <div className="text-base sm:text-xl font-black text-gray-900 dark:text-white leading-tight break-words">
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
              className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 p-4 sm:p-5"
            >
              <h3 className="font-black text-gray-900 dark:text-white mb-2.5 flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-green-600" aria-hidden="true" />
                </span>
                <span className="min-w-0">{title}</span>
              </h3>
              {intro && (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{intro}</p>
              )}
              {points.length > 0 && (
                <ul className="space-y-2">
                  {points.map((point, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="min-w-0">{point}</span>
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
          <section className="rounded-2xl border border-green-100 dark:border-green-900/30 bg-green-50/60 dark:bg-green-900/10 p-4 sm:p-5 text-center">
            <p className="font-black text-gray-900 dark:text-white mb-4">{t('trust.ctaTitle')}</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 sm:justify-center">
              {ctas.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-green-500 hover:text-green-600 transition-colors"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  {label}
                  <ArrowRight className="w-4 h-4 opacity-60 flex-shrink-0" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
