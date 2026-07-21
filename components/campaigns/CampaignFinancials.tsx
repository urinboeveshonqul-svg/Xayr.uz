import { CheckCircle2, Circle, TrendingUp, Percent, CreditCard, Banknote, Wallet, Hourglass } from 'lucide-react';
import { formatAmount } from '@/lib/utils';

export interface CampaignFinancialsData {
  totalDonations: number;
  /** Platform commission collected on paid withdrawals (context, not a deduction here). */
  platformFee: number;
  providerFee: number;
  /** GROSS already withdrawn (Σ amount of paid requests). */
  completedWithdrawals: number;
  /** GROSS committed to active requests (Σ amount of pending/approved/info). */
  pendingWithdrawals: number;
  /** GROSS — the amount the creator can request today (= the withdrawal ceiling). */
  availableBalance: number;
}

export interface TimelineStage {
  label: string;
  done: boolean;
}

export interface CampaignFinancialsLabels {
  title: string;
  subtitle: string;
  totalDonations: string;
  platformFee: string;
  providerFee: string;
  completedWithdrawals: string;
  pendingWithdrawals: string;
  availableBalance: string;
  timelineTitle: string;
}

// GROSS balance flow, top to bottom. All figures are gross, so the chain
// reconciles exactly to the highlighted total below:
//   totalDonations − completedWithdrawals − pendingWithdrawals = availableBalance
// `deduction` rows render as negatives ("−X so'm") so the list reads as a
// subtraction down to Available to withdraw.
const ROWS: { key: keyof CampaignFinancialsData; labelKey: keyof CampaignFinancialsLabels; Icon: typeof Wallet; deduction?: boolean }[] = [
  { key: 'totalDonations', labelKey: 'totalDonations', Icon: TrendingUp },
  { key: 'completedWithdrawals', labelKey: 'completedWithdrawals', Icon: Banknote, deduction: true },
  { key: 'pendingWithdrawals', labelKey: 'pendingWithdrawals', Icon: Hourglass, deduction: true },
];

// Context rows shown BELOW the available total — not part of the subtraction
// (the commission is already inside the gross completed withdrawals). They show
// how much of what was withdrawn went to the platform vs the payment provider.
const INFO_ROWS: { key: keyof CampaignFinancialsData; labelKey: keyof CampaignFinancialsLabels; Icon: typeof Wallet }[] = [
  { key: 'platformFee', labelKey: 'platformFee', Icon: Percent },
  { key: 'providerFee', labelKey: 'providerFee', Icon: CreditCard },
];

/**
 * Per-campaign financial breakdown + a money-flow timeline. Presentational; the
 * page computes values from tamper-proof balances and passes them in. Shown to
 * the campaign owner (and admins) on the withdrawal page — it explains where
 * every so'm went and ends with "Available to withdraw" as the result.
 */
export function CampaignFinancials({
  data,
  timeline,
  labels,
}: {
  data: CampaignFinancialsData;
  timeline: TimelineStage[];
  labels: CampaignFinancialsLabels;
}) {
  // Exact amounts — never `formatMoney` here: it rounds to the nearest thousand,
  // which would mask the commission and make different amounts look identical.
  const money = (n: number) => `${formatAmount(n)} so'm`;
  // Deductions render as "−X so'm" (only when non-zero, so a real 0 stays "0 so'm").
  const signed = (n: number, deduction?: boolean) =>
    deduction && n > 0 ? `−${money(n)}` : money(n);

  return (
    <section className="card p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-black text-gray-900 dark:text-white">{labels.title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{labels.subtitle}</p>

      <dl className="divide-y divide-gray-100 dark:divide-gray-800">
        {ROWS.map(({ key, labelKey, Icon, deduction }) => (
          <div key={key} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 min-w-0">
              <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0">{labels[labelKey]}</span>
            </dt>
            <dd className={`tabular-nums text-right flex-shrink-0 text-sm font-semibold ${deduction && data[key] > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {signed(data[key], deduction)}
            </dd>
          </div>
        ))}
      </dl>

      {/* Result of the balance flow: Available to withdraw (gross). Same value
          and wording as the withdrawal dialog headline — never a conflicting number. */}
      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 px-4 py-3">
        <dt className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-400 min-w-0">
          <Wallet className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0">{labels.availableBalance}</span>
        </dt>
        <dd className="tabular-nums text-right flex-shrink-0 text-base font-black text-brand-700 dark:text-brand-400">
          {money(data.availableBalance)}
        </dd>
      </div>

      {/* Context — of what has been withdrawn, how much went to the platform /
          provider. Not part of the subtraction above (already inside the gross). */}
      <dl className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        {INFO_ROWS.map(({ key, labelKey, Icon }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 min-w-0">
              <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0">{labels[labelKey]}</span>
            </dt>
            <dd className="tabular-nums text-right flex-shrink-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
              {money(data[key])}
            </dd>
          </div>
        ))}
      </dl>

      {/* Money-flow timeline */}
      <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{labels.timelineTitle}</h3>
        <ol className="space-y-0">
          {timeline.map((stage, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                {stage.done ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 dark:text-gray-700 flex-shrink-0" aria-hidden="true" />
                )}
                {i < timeline.length - 1 && (
                  <span className={`w-0.5 h-6 ${stage.done ? 'bg-green-200 dark:bg-green-900/40' : 'bg-gray-200 dark:bg-gray-800'}`} />
                )}
              </div>
              <span className={`text-sm pb-3 ${stage.done ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                {stage.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
