import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TrendingUp, Hash, BarChart3, Trophy, Clock, RotateCcw, Percent, CreditCard,
  Banknote, HandCoins, Hourglass, Wallet, AlertTriangle, Download, ShieldCheck,
  CalendarDays, FileSpreadsheet, FileText, LineChart,
} from 'lucide-react';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { formatMoney } from '@/lib/utils';
import { getFinancialSummary, getIntegrityIssues, getRecentLedger, getPublicSeries, type LedgerEntryType } from '@/lib/finance';
import { MoneyBarChart } from '@/components/charts/MoneyBarChart';
import { FinancePeriodTabs } from '@/components/admin/FinancePeriodTabs';

export const metadata: Metadata = { title: 'Financial Dashboard — Xayr' };
export const dynamic = 'force-dynamic';

const ENTRY_COLOR: Partial<Record<LedgerEntryType, string>> = {
  donation: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  refund: 'text-red-600 bg-red-50 dark:bg-red-900/20',
  platform_fee: 'text-brand-600 bg-brand-50 dark:bg-brand-900/20',
  provider_fee: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
  withdrawal: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  withdrawal_completed: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  withdrawal_requested: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  withdrawal_approved: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20',
  withdrawal_cancelled: 'text-gray-600 bg-gray-100 dark:bg-gray-800',
  campaign_credit: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
  chargeback: 'text-red-700 bg-red-50 dark:bg-red-900/20',
  adjustment: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
  admin_correction: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
};

export default async function AdminFinancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const fin = (await getDictionary(lng)).fin;

  const [s, issues, ledger, series] = await Promise.all([
    getFinancialSummary(),
    getIntegrityIssues(),
    getRecentLedger(40),
    getPublicSeries(12),
  ]);

  const money = (n: number) => `${formatMoney(n)} so'm`;

  // Period tabs (Today / Week / Month / Year / All Time) for donations.
  const periods = [
    { key: 'today', label: fin.today, amount: money(s.today_amount), sub: `${s.today_count} ${fin.donationsWord}` },
    { key: 'week', label: fin.thisWeek, amount: money(s.week_amount) },
    { key: 'month', label: fin.thisMonth, amount: money(s.month_amount) },
    { key: 'year', label: fin.thisYear, amount: money(s.year_amount) },
    { key: 'all', label: fin.allTime, amount: money(s.total_donations_amount), sub: `${s.donations_count.toLocaleString('uz-UZ')} ${fin.donationsWord}` },
  ];

  // Monthly money-flow chart (donations vs withdrawals).
  const chartPoints = series.map((p) => ({
    label: new Date(p.month).toLocaleDateString(lng, { month: 'short' }),
    values: [p.donations, p.withdrawals],
  }));

  // Primary money metrics.
  const metrics: { label: string; value: string; sub?: string; icon: typeof TrendingUp; color: string; bg: string }[] = [
    { label: fin.totalDonations, value: money(s.total_donations_amount), sub: `${s.donations_count.toLocaleString('uz-UZ')} ${fin.donationsWord}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: fin.netToCreators, value: money(s.net_to_creators), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: fin.withdrawnGross, value: money(s.withdrawn_gross), icon: Banknote, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: fin.platformFees, value: money(s.platform_fees_collected), icon: Percent, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-900/20' },
    { label: fin.providerFees, value: money(s.provider_fees_collected), icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { label: fin.refunded, value: money(s.refunded_amount), icon: RotateCcw, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: fin.availableForWithdrawal, value: money(s.available_for_withdrawal), icon: Wallet, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20' },
    { label: fin.pendingWithdrawals, value: money(s.pending_withdrawals_amount), sub: `${s.pending_withdrawals_count} ${fin.requestsWord}`, icon: Hourglass, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: fin.pendingPayments, value: money(s.pending_payments_amount), sub: `${s.pending_payments_count} ${fin.donationsWord}`, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
    { label: fin.avgDonation, value: money(s.avg_donation), icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { label: fin.largestDonation, value: money(s.largest_donation), icon: Trophy, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { label: fin.donationsCount, value: s.donations_count.toLocaleString('uz-UZ'), icon: Hash, color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800' },
  ];

  // Time windows.
  const windows = [
    { label: fin.today, value: money(s.today_amount), sub: `${s.today_count} ${fin.donationsWord}` },
    { label: fin.thisWeek, value: money(s.week_amount) },
    { label: fin.thisMonth, value: money(s.month_amount) },
    { label: fin.thisYear, value: money(s.year_amount) },
  ];

  return (
    <div className="space-y-10">
      {/* Header + export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{fin.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{fin.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/admin/finance/export?format=csv`} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors">
            <Download className="w-4 h-4" /> {fin.exportCsv}
          </a>
          <a href={`/api/admin/finance/export?format=xls`} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-brand-500 hover:text-brand-600 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> {fin.exportExcel}
          </a>
          <Link href={`/${lng}/admin/finance/report`} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-brand-500 hover:text-brand-600 transition-colors">
            <FileText className="w-4 h-4" /> {fin.exportPdf}
          </Link>
        </div>
      </div>

      {/* Period tabs */}
      <FinancePeriodTabs periods={periods} caption={fin.totalDonations} />

      {/* Integrity */}
      {issues.length > 0 ? (
        <section className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-5">
          <h3 className="font-black text-red-700 dark:text-red-400 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5" /> {fin.integrityWarning} ({issues.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-red-700/70 dark:text-red-400/70">
                  <th className="py-2 pr-4">{fin.campaign}</th>
                  <th className="py-2 pr-4 text-right">{fin.raised}</th>
                  <th className="py-2 pr-4 text-right">{fin.committed}</th>
                  <th className="py-2 pr-4 text-right">{fin.ledgerNet}</th>
                  <th className="py-2 text-right">{fin.discrepancy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                {issues.map((it) => (
                  <tr key={it.campaign_id}>
                    <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-white truncate max-w-[220px]">{it.campaign_title}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(it.raised)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(it.committed)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(it.ledger_net)}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-red-600">{money(it.discrepancy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/10 p-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-green-600" />
          <span className="text-sm font-bold text-green-700 dark:text-green-400">{fin.integrityOk}</span>
        </section>
      )}

      {/* Metric grid */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m, i) => (
            <div key={i} className="card p-5">
              <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center mb-3`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <div className="text-xl font-black text-gray-900 dark:text-white break-words">{m.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">{m.label}</div>
              {m.sub && <div className="text-[11px] text-gray-400 mt-0.5">{m.sub}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Time windows */}
      <section>
        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> {fin.overTime}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {windows.map((w, i) => (
            <div key={i} className="card p-5">
              <div className="text-lg font-black text-gray-900 dark:text-white break-words">{w.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">{w.label}</div>
              {w.sub && <div className="text-[11px] text-gray-400 mt-0.5">{w.sub}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Monthly money-flow chart (from real ledger/payout data) */}
      <section className="card p-5">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <LineChart className="w-5 h-5 text-brand-600" /> {fin.monthlyFlow}
        </h3>
        <MoneyBarChart
          points={chartPoints}
          seriesLabels={[fin.chartDonations, fin.chartWithdrawals]}
          colors={['#16a34a', '#2563eb']}
          emptyLabel={fin.noChartData}
        />
      </section>

      {/* Recent ledger */}
      <section>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{fin.recentLedger}</h3>
        {ledger.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500 dark:text-gray-400">{fin.ledgerEmpty}</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-3 px-4">{fin.type}</th>
                  <th className="py-3 px-4 text-right">{fin.amount}</th>
                  <th className="py-3 px-4">{fin.status}</th>
                  <th className="py-3 px-4 text-right">{fin.date}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${ENTRY_COLOR[e.entry_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {fin.entryTypes[e.entry_type] ?? e.entry_type}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-right tabular-nums font-bold ${e.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {e.amount < 0 ? '−' : '+'}{formatMoney(Math.abs(e.amount))} so&apos;m
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{e.status}</td>
                    <td className="py-3 px-4 text-right text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleDateString(lng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Link href={`/api/admin/finance/export`} className="text-brand-600 hover:underline inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> {fin.exportFull}
          </Link>
        </p>
      </section>
    </div>
  );
}
