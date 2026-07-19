import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Heart, TrendingUp, HandCoins, CheckCircle2, Megaphone, ShieldCheck, Users, ArrowRight,
  BarChart3, Trophy, LineChart,
} from 'lucide-react';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { formatMoney } from '@/lib/utils';
import { getPublicFinancialStats, getPublicSeries } from '@/lib/finance';
import { MoneyBarChart } from '@/components/charts/MoneyBarChart';

interface Props {
  params: Promise<{ locale: string }>;
}

// Aggregates change slowly; cache to avoid recomputing on every visit.
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  return pageMetadata({
    locale: loc,
    path: '/transparency',
    title: dict.transparencyPage.title,
    description: dict.transparencyPage.subtitle,
  });
}

export default async function TransparencyPage({ params }: Props) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  const tp = dict.transparencyPage;
  const [stats, series] = await Promise.all([getPublicFinancialStats(), getPublicSeries(12)]);

  const money = (n: number) => `${formatMoney(n)} so'm`;
  const count = (n: number) => n.toLocaleString('uz-UZ');

  const chartPoints = series.map((p) => ({
    label: new Date(p.month).toLocaleDateString(loc, { month: 'short' }),
    values: [p.donations, p.withdrawals],
  }));

  // Real database values only — never fabricated.
  const cards = [
    { label: tp.statRaised, value: money(stats.total_raised), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: tp.statDelivered, value: money(stats.total_delivered), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: tp.statTotalDonations, value: count(stats.total_donations), icon: Heart, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: tp.statAvgDonation, value: money(stats.avg_donation), icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { label: tp.statLargestDonation, value: money(stats.largest_donation), icon: Trophy, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { label: tp.statSuccessful, value: count(stats.successful_campaigns), icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20' },
    { label: tp.statActive, value: count(stats.active_campaigns), icon: Megaphone, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: tp.statVerified, value: count(stats.verified_campaigns), icon: ShieldCheck, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-900/20' },
    { label: tp.statUsers, value: count(stats.registered_users), icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  ];

  return (
    <>
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-sm font-bold mb-4">
              <ShieldCheck className="w-4 h-4" /> {tp.badge}
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">{tp.title}</h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">{tp.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((c, i) => (
              <section key={i} className="card p-6">
                <div className={`w-12 h-12 rounded-2xl ${c.bg} flex items-center justify-center mb-4`}>
                  <c.icon className={`w-6 h-6 ${c.color}`} />
                </div>
                <div className="text-2xl font-black text-gray-900 dark:text-white break-words">{c.value}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 font-semibold mt-1">{c.label}</div>
              </section>
            ))}
          </div>

          {/* Monthly growth (real aggregated values; no PII) */}
          <section className="card p-6 mt-8">
            <h2 className="text-base font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <LineChart className="w-5 h-5 text-brand-600" /> {tp.growthTitle}
            </h2>
            <MoneyBarChart
              points={chartPoints}
              seriesLabels={[tp.chartDonations, tp.chartWithdrawals]}
              colors={['#16a34a', '#2563eb']}
              emptyLabel={tp.noChartData}
            />
          </section>

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {tp.note}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={`/${loc}/fees`} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-brand-500 hover:text-brand-600 transition-colors">
              {tp.feesLink} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href={`/${loc}/campaigns`} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors">
              {tp.browseLink} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
