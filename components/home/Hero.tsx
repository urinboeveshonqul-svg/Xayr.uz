'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles, ShieldCheck, Heart, HandHeart } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Homepage hero, designed around the wide 3:2 community illustration
 * (public/hero.png, 1536×1024). Centered messaging up top, then the artwork as a
 * full-width framed showcase shown on every breakpoint at its true ratio
 * (object-cover on a matching 3:2 frame → never cropped). The frame reserves its
 * aspect-ratio box so there is no layout shift (CLS) while the priority image loads.
 */
export function Hero({
  activeCampaigns = 0,
  donors = 0,
}: {
  activeCampaigns?: number;
  donors?: number;
}) {
  const { t, locale } = useI18n();
  const L = (path: string) => `/${locale}${path}`;

  const nf = (n: number) => n.toLocaleString('uz-UZ');
  const hasProof = activeCampaigns > 0 || donors > 0;

  const trust = [
    { Icon: ShieldCheck, label: t('hero.trustReliable'), tint: 'text-green-600 bg-green-100' },
    { Icon: HandHeart, label: t('hero.trustNoFee'), tint: 'text-emerald-600 bg-emerald-100' },
    { Icon: Heart, label: t('hero.trustFast'), tint: 'text-rose-600 bg-rose-100' },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-green-50/70 to-emerald-50/50">
      {/* Decorative palette-matched glows (purely decorative) */}
      <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] bg-green-300 rounded-full mix-blend-multiply blur-3xl opacity-20 animate-blob" />
      <div aria-hidden className="pointer-events-none absolute top-32 -left-24 w-[26rem] h-[26rem] bg-teal-300 rounded-full mix-blend-multiply blur-3xl opacity-20 animate-blob animation-delay-2000" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">

        {/* ── Messaging ───────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto text-center space-y-6 sm:space-y-7">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur rounded-full shadow-sm ring-1 ring-green-200/70">
            <Sparkles className="w-4 h-4 text-green-600" />
            <span className="text-xs sm:text-sm font-bold text-gray-700">{t('hero.badge')}</span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] sm:text-xs font-black tracking-wide">
              {t('hero.badgeNew')}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-gray-900 leading-[1.08] tracking-tight text-balance">
            {t('hero.titlePrefix')}{' '}
            <span className="relative inline-block">
              <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-600">
                {t('hero.titleHighlight')}
              </span>
              <svg aria-hidden className="absolute -bottom-1.5 left-0 w-full" height="12" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
                <path d="M2 10C80 3 220 3 298 10" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
              </svg>
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
            {t('hero.subtitle')}{' '}
            <span className="font-bold text-green-600">{t('hero.safe')}</span>
            {' · '}
            <span className="font-bold text-green-600">{t('hero.free')}</span>.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-1">
            <Link
              href={L('/campaigns/create')}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-base sm:text-lg font-black shadow-lg shadow-green-600/20 hover:shadow-xl hover:shadow-green-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              <span>{t('hero.ctaCreate')}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href={L('/campaigns')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-white text-gray-800 text-base sm:text-lg font-bold border border-gray-200 shadow-sm hover:border-green-400 hover:text-green-700 hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              <Heart className="w-5 h-5 text-green-600" />
              <span>{t('hero.ctaDonate')}</span>
            </Link>
          </div>

          {/* Social proof (real numbers only — never shows zeros) */}
          {hasProof && (
            <p className="text-sm text-gray-500">
              <span className="font-extrabold text-gray-800">{nf(activeCampaigns)}</span> {t('hero.campaigns')}
              <span className="mx-2 text-gray-300">•</span>
              <span className="font-extrabold text-gray-800">{nf(donors)}</span> {t('hero.donors')}
            </p>
          )}

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 pt-1">
            {trust.map(({ Icon, label, tint }) => (
              <div key={label} className="flex items-center gap-2 text-gray-600">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tint}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Illustration showcase (all breakpoints, never cropped) ── */}
        <div className="relative mx-auto mt-12 sm:mt-16 w-full max-w-5xl">
          <div
            aria-hidden
            className="absolute -inset-3 sm:-inset-5 bg-gradient-to-tr from-green-400/30 via-emerald-300/20 to-teal-400/30 blur-3xl rounded-[2.5rem]"
          />
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl sm:rounded-3xl ring-1 ring-black/5 border border-white/70 shadow-2xl bg-gradient-to-br from-green-50 to-emerald-50">
            <Image
              src="/hero.png"
              alt={t('hero.imageAlt')}
              fill
              sizes="(min-width: 1024px) 1024px, 92vw"
              quality={90}
              priority
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
