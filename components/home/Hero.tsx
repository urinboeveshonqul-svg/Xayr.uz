'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles, Shield, Zap, Heart } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export function Hero({
  activeCampaigns = 0,
  donors = 0,
}: {
  activeCampaigns?: number;
  donors?: number;
}) {
  const { t, locale } = useI18n();
  const L = (path: string) => `/${locale}${path}`;

  return (
    <section className="relative min-h-[90vh] flex items-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 overflow-hidden">
      {/* Floating Blobs */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-green-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute bottom-20 left-10 w-72 h-72 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute top-40 left-1/2 w-72 h-72 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left Content */}
          <div className="text-center lg:text-left space-y-8">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-full shadow-lg border border-green-200 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-green-600" />
              <span className="text-sm font-bold text-gray-700">{t('hero.badge')}</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">{t('hero.badgeNew')}</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-gray-900 leading-[1.1] tracking-tight">
              {t('hero.titlePrefix')}{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-600">
                  {t('hero.titleHighlight')}
                </span>
                <svg className="absolute -bottom-2 left-0 w-full" height="12" viewBox="0 0 300 12" fill="none">
                  <path d="M2 10C80 3 220 3 298 10" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" opacity="0.3"/>
                </svg>
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl sm:text-2xl text-gray-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              {t('hero.subtitle')}{' '}
              <span className="font-bold text-green-600">{t('hero.safe')}</span>{' · '}
              <span className="font-bold text-green-600">{t('hero.free')}</span>.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href={L('/campaigns/create')}
                className="group px-8 py-5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl text-lg font-black shadow-2xl hover:shadow-green-500/50 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <span>{t('hero.ctaCreate')}</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href={L('/campaigns')}
                className="px-8 py-5 bg-transparent text-gray-800 rounded-2xl text-lg font-bold border-2 border-gray-300 hover:border-green-500 hover:text-green-700 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <span>{t('hero.ctaDonate')}</span>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-4">
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-sm font-semibold">{t('hero.trustReliable')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-semibold">{t('hero.trustFast')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Heart className="w-5 h-5 text-green-600 fill-green-600" />
                </div>
                <span className="text-sm font-semibold">{t('hero.trustNoFee')}</span>
              </div>
            </div>
          </div>

          {/* Right Image/Illustration */}
          <div className="relative hidden lg:flex items-center justify-center">
            <div className="relative w-full max-w-lg">
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-[3rem] blur-2xl opacity-30 animate-pulse"></div>
              <div className="relative rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white">
                {/* To use your own photo: replace /public/hero.png and keep this src.
                    Layout, dimensions, and responsive behavior are unchanged. */}
                <Image
                  src="/hero.png"
                  alt="Xayr — jamiyat yordami"
                  width={600}
                  height={400}
                  sizes="(min-width: 1024px) 600px, 0px"
                  quality={85}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>

            {/* Floating Cards */}
            <div className="absolute -top-6 -right-6 bg-white rounded-2xl shadow-2xl p-5 animate-float border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center text-white text-2xl font-black">
                  {activeCampaigns.toLocaleString('uz-UZ')}
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-semibold">{t('hero.statActive')}</div>
                  <div className="text-sm font-black text-gray-900">{t('hero.campaigns')}</div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-2xl p-5 animate-float animation-delay-2000 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-2xl font-black">
                  {donors.toLocaleString('uz-UZ')}
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-semibold">{t('hero.statActive')}</div>
                  <div className="text-sm font-black text-gray-900">{t('hero.donors')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
