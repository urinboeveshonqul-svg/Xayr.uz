import type { Metadata } from 'next';
import { Percent, CreditCard, Wallet, Calculator, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
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
    path: '/fees',
    title: dict.feesPage.title,
    description: dict.feesPage.subtitle,
  });
}

const CARD_ICONS = [Percent, CreditCard, Wallet];

export default async function FeesPage({ params }: Props) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  const f = dict.feesPage;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
              {f.title}
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">{f.subtitle}</p>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
            {f.cards.map((card, i) => {
              const Icon = CARD_ICONS[i] ?? Percent;
              return (
                <section key={i} className="card p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-brand-600" />
                  </div>
                  <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {card.title}
                  </h2>
                  <p className="text-2xl font-black text-brand-600 my-2">{card.value}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{card.text}</p>
                </section>
              );
            })}
          </div>

          {/* Example breakdown */}
          <section className="card p-6 sm:p-8 max-w-xl mx-auto">
            <h2 className="text-lg font-black text-gray-900 dark:text-white mb-5 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-brand-600" />
              {f.exampleTitle}
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{f.exampleDonation}</dt>
                <dd className="font-bold text-gray-900 dark:text-white">{f.exampleDonationValue}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{f.exampleFee}</dt>
                <dd className="font-bold text-gray-900 dark:text-white">{f.exampleFeeValue}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                <dt className="font-bold text-gray-900 dark:text-white">{f.exampleReceives}</dt>
                <dd className="text-xl font-black text-brand-600">{f.exampleReceivesValue}</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-400 mt-5 leading-relaxed">{f.exampleNote}</p>
          </section>

          {/* What the platform fee funds — why it exists & how it keeps XAYR sustainable */}
          <section className="card p-6 sm:p-8 max-w-2xl mx-auto mt-8">
            <h2 className="text-lg font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-600" />
              {dict.transparency.feeUseTitle}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
              {dict.transparency.feeBody}
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-5">
              {dict.transparency.feeItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {dict.transparency.sustainability}
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
