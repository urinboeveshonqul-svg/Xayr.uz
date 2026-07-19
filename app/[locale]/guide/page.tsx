import type { Metadata } from 'next';
import Link from 'next/link';
import { UserPlus, ShieldCheck, Megaphone, HandHeart, Wallet, ArrowRight, HelpCircle } from 'lucide-react';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  return pageMetadata({
    locale: loc,
    path: '/guide',
    title: dict.guidePage.title,
    description: dict.guidePage.subtitle,
  });
}

const STEP_ICONS = [UserPlus, ShieldCheck, Megaphone, HandHeart, Wallet];

export default async function GuidePage({ params }: Props) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  const g = dict.guidePage;
  const L = (path: string) => `/${loc}${path}`;

  return (
    <>
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
              {g.title}
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">{g.subtitle}</p>
          </div>

          {/* Step cards */}
          <ol className="space-y-4">
            {g.steps.map((step, i) => {
              const Icon = STEP_ICONS[i] ?? HandHeart;
              return (
                <li key={i} className="card p-6 flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-brand-600" />
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-black flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">{step.title}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* FAQ link */}
          <div className="card p-6 mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-8 h-8 text-brand-600 flex-shrink-0" />
              <div>
                <h2 className="font-black text-gray-900 dark:text-white">{g.faqTitle}</h2>
                <p className="text-sm text-gray-500">{g.faqText}</p>
              </div>
            </div>
            <Link href={L('/faq')} className="btn-ghost border border-gray-200 dark:border-gray-700 px-5 py-2.5 flex-shrink-0">
              {g.faqCta} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-5">{g.ctaTitle}</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={L('/campaigns/create')} className="btn-primary px-8 py-3.5 text-base">
                {g.ctaCreate} <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href={L('/campaigns')}
                className="px-8 py-3.5 rounded-xl text-base font-bold border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600 transition-all"
              >
                {g.ctaBrowse}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
