import { CheckCircle2, Circle, Target, TrendingUp, Percent, CreditCard, HandCoins, Banknote, Wallet, Hourglass, PiggyBank } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

export interface CampaignFinancialsData {
  goal: number;
  raised: number;
  platformFee: number;
  providerFee: number;
  netAmount: number;
  totalWithdrawn: number;
  availableBalance: number;
  pendingWithdrawal: number;
  remainingBalance: number;
}

export interface TimelineStage {
  label: string;
  done: boolean;
}

export interface CampaignFinancialsLabels {
  title: string;
  subtitle: string;
  goal: string;
  raised: string;
  platformFee: string;
  providerFee: string;
  netAmount: string;
  totalWithdrawn: string;
  availableBalance: string;
  pendingWithdrawal: string;
  remainingBalance: string;
  timelineTitle: string;
}

const ROWS: { key: keyof CampaignFinancialsData; labelKey: keyof CampaignFinancialsLabels; Icon: typeof Target; strong?: boolean }[] = [
  { key: 'goal', labelKey: 'goal', Icon: Target },
  { key: 'raised', labelKey: 'raised', Icon: TrendingUp, strong: true },
  { key: 'platformFee', labelKey: 'platformFee', Icon: Percent },
  { key: 'providerFee', labelKey: 'providerFee', Icon: CreditCard },
  { key: 'netAmount', labelKey: 'netAmount', Icon: HandCoins },
  { key: 'totalWithdrawn', labelKey: 'totalWithdrawn', Icon: Banknote },
  { key: 'pendingWithdrawal', labelKey: 'pendingWithdrawal', Icon: Hourglass },
  { key: 'availableBalance', labelKey: 'availableBalance', Icon: Wallet, strong: true },
  { key: 'remainingBalance', labelKey: 'remainingBalance', Icon: PiggyBank },
];

/**
 * Per-campaign financial breakdown + a money-flow timeline. Presentational; the
 * page computes values from tamper-proof balances and passes them in. Shown to
 * the campaign owner (and admins) on the withdrawal page.
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
  const money = (n: number) => `${formatMoney(n)} so'm`;

  return (
    <section className="card p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-black text-gray-900 dark:text-white">{labels.title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{labels.subtitle}</p>

      <dl className="divide-y divide-gray-100 dark:divide-gray-800">
        {ROWS.map(({ key, labelKey, Icon, strong }) => (
          <div key={key} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 min-w-0">
              <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0">{labels[labelKey]}</span>
            </dt>
            <dd className={`tabular-nums text-right flex-shrink-0 ${strong ? 'text-base font-black text-gray-900 dark:text-white' : 'text-sm font-semibold text-gray-700 dark:text-gray-300'}`}>
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
