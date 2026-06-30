import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { formatMoney } from '@/lib/utils';
import { getFinancialSummary, getReconciliationReport } from '@/lib/finance';
import { PrintButton } from '@/components/admin/PrintButton';

export const metadata: Metadata = { title: 'Financial Report — Xayr' };
export const dynamic = 'force-dynamic';

// Print-only rule: when printing, hide everything except #print-report so the
// admin chrome (navbar/tabs) doesn't bleed into the saved PDF.
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #print-report, #print-report * { visibility: visible !important; }
  #print-report { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}`;

export default async function FinanceReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const fin = (await getDictionary(lng)).fin;

  const [s, recon] = await Promise.all([getFinancialSummary(), getReconciliationReport()]);
  const money = (n: number) => `${formatMoney(n)} so'm`;
  const mismatches = recon.filter((r) => !r.is_balanced);
  const generatedAt = new Date().toLocaleString(lng);

  const rows: [string, string][] = [
    [fin.totalDonations, money(s.total_donations_amount)],
    [fin.donationsCount, s.donations_count.toLocaleString('uz-UZ')],
    [fin.netToCreators, money(s.net_to_creators)],
    [fin.withdrawnGross, money(s.withdrawn_gross)],
    [fin.platformFees, money(s.platform_fees_collected)],
    [fin.providerFees, money(s.provider_fees_collected)],
    [fin.refunded, money(s.refunded_amount)],
    [fin.availableForWithdrawal, money(s.available_for_withdrawal)],
    [fin.pendingWithdrawals, money(s.pending_withdrawals_amount)],
    [fin.pendingPayments, money(s.pending_payments_amount)],
    [fin.avgDonation, money(s.avg_donation)],
    [fin.largestDonation, money(s.largest_donation)],
  ];

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link href={`/${lng}/admin/finance`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {fin.title}
        </Link>
        <PrintButton label={fin.exportPdf} />
      </div>

      <div id="print-report" className="card p-6 sm:p-8 bg-white text-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-5">
          <div>
            <h1 className="text-2xl font-black">XAYR — {fin.reportTitle}</h1>
            <p className="text-sm text-gray-500">{fin.generatedAt}: {generatedAt}</p>
          </div>
        </div>

        <h2 className="text-base font-black mb-3">{fin.title}</h2>
        <table className="w-full text-sm mb-6">
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 text-gray-600">{k}</td>
                <td className="py-2 text-right font-bold tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-base font-black mb-3">{fin.reconciliation}</h2>
        {mismatches.length === 0 ? (
          <p className="text-sm text-green-700 font-semibold">{fin.integrityOk}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-200">
                <th className="py-2">{fin.campaign}</th>
                <th className="py-2 text-right">{fin.totalDonations}</th>
                <th className="py-2 text-right">{fin.discrepancy}</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((m) => (
                <tr key={m.campaign_id} className="border-b border-gray-100">
                  <td className="py-2">{m.campaign_title}</td>
                  <td className="py-2 text-right tabular-nums">{money(m.total_donations)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-red-600">{money(m.discrepancy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
