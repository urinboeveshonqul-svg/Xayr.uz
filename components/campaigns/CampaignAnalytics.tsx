import Link from 'next/link';
import {
  TrendingUp, Users, Eye, Target, Coins, Clock, BarChart3, Megaphone, ArrowLeft, Heart, Share2,
} from 'lucide-react';
import { formatMoney, getProgress, daysLeft, timeAgo } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

interface CampaignInfo {
  title: string;
  slug: string;
  goal_amount: number;
  current_amount: number;
  donors_count: number;
  views: number;
  status: string;
  deadline: string | null;
  created_at: string;
}
interface DonationItem {
  id: string;
  amount: number;
  donor_name: string | null;
  message: string | null;
  created_at: string;
}
interface UpdateItem {
  id: string;
  title: string;
  created_at: string;
}
interface ChartBucket {
  label: string;
  total: number;
}
interface ShareStat {
  source: string;
  total: number;
}

const STATUS_CLS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pending:   'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  active:    'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  paused:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  rejected:  'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  completed: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
};

export async function CampaignAnalytics({
  campaign,
  recentDonations,
  recentUpdates,
  chart,
  shareStats = [],
  locale,
}: {
  campaign: CampaignInfo;
  recentDonations: DonationItem[];
  recentUpdates: UpdateItem[];
  chart: ChartBucket[];
  shareStats?: ShareStat[];
  locale: string;
}) {
  const dict = await getDictionary(isLocale(locale) ? locale : 'uz');
  const d = dict.dash;
  const sh = dict.share;

  // Order + label the share sources; sum for the total + percentage bars.
  const SHARE_ORDER = ['whatsapp', 'telegram', 'facebook', 'x', 'copy_link', 'native', 'other'] as const;
  const shareLabel: Record<string, string> = {
    whatsapp: sh.srcWhatsapp, telegram: sh.srcTelegram, facebook: sh.srcFacebook,
    x: sh.srcX, copy_link: sh.srcCopyLink, native: sh.srcNative, other: sh.srcOther,
  };
  const shareBySource = new Map(shareStats.map((s) => [s.source, Number(s.total)] as const));
  const shareTotal = shareStats.reduce((sum, s) => sum + Number(s.total), 0);
  const shareRows = SHARE_ORDER
    .map((src) => ({ src, total: shareBySource.get(src) ?? 0 }))
    .filter((r) => r.total > 0);
  const statusLabel: Record<string, string> = {
    draft: d.stDraft, pending: d.stPending, active: d.stActive,
    paused: d.stPaused, rejected: d.stRejected, completed: d.stCompleted,
  };

  const pct = getProgress(campaign.current_amount, campaign.goal_amount);
  const days = daysLeft(campaign.deadline);
  const avg = campaign.donors_count > 0 ? Math.round(campaign.current_amount / campaign.donors_count) : 0;
  const statusCls = STATUS_CLS[campaign.status] ?? STATUS_CLS.active;
  const maxBar = Math.max(...chart.map((c) => c.total), 1);
  const hasChartData = chart.some((c) => c.total > 0);

  const cards = [
    { icon: TrendingUp, label: d.raisedLbl,         value: `${formatMoney(campaign.current_amount)} so'm`, color: 'text-green-600',   bg: 'bg-green-50 dark:bg-green-900/20' },
    { icon: Target,     label: d.completionLbl,     value: `${pct}%`,                                       color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { icon: Users,      label: dict.ux.donors,      value: campaign.donors_count.toLocaleString('uz-UZ'),   color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { icon: Coins,      label: d.avgDonation,       value: `${formatMoney(avg)} so'm`,                      color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { icon: Eye,        label: d.viewsLbl,          value: campaign.views.toLocaleString('uz-UZ'),          color: 'text-purple-600',  bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { icon: Clock,      label: dict.ux.daysLeft,    value: days !== null ? String(days > 0 ? days : 0) : '∞', color: 'text-orange-600',  bg: 'bg-orange-50 dark:bg-orange-900/20' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/${locale}/campaigns/${campaign.slug}`} className="btn-ghost inline-flex mb-2 text-sm">
            <ArrowLeft className="w-4 h-4" /> {d.backToCampaign}
          </Link>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-600" /> {d.analyticsTitle}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 truncate">{campaign.title}</p>
        </div>
        <span className={`badge self-start ${statusCls}`}>{statusLabel[campaign.status] ?? campaign.status}</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="card p-5">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <div className="text-xl font-black text-gray-900 dark:text-white break-words">{c.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Progress toward goal */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-bold text-gray-900 dark:text-white">{d.towardGoal}</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatMoney(campaign.current_amount)} / {formatMoney(campaign.goal_amount)} so&apos;m
          </span>
        </div>
        <ProgressBar raised={campaign.current_amount} goal={campaign.goal_amount} />
      </div>

      {/* Donations chart — only when there is data */}
      {hasChartData && (
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" /> {d.chart14}
          </h2>
          <div className="flex items-end gap-1 h-40">
            {chart.map((c, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t-sm"
                style={{ height: `${(c.total / maxBar) * 100}%` }}
                title={`${formatMoney(c.total)} so'm`}
              />
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            {chart.map((c, i) => (
              <span key={i} className="flex-1 text-center text-[10px] text-gray-400">
                {i % 2 === 0 ? c.label : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Traffic sources — where shares came from (owner-only). Hidden until
          at least one share is recorded. */}
      {shareRows.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Share2 className="w-5 h-5 text-brand-600" /> {sh.trafficSources}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {sh.totalShares}: {shareTotal.toLocaleString('uz-UZ')}
            </span>
          </div>
          <ul className="space-y-3">
            {shareRows.map(({ src, total }) => {
              const barPct = shareTotal > 0 ? Math.round((total / shareTotal) * 100) : 0;
              return (
                <li key={src}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{shareLabel[src] ?? src}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {total.toLocaleString('uz-UZ')} · {barPct}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500" style={{ width: `${barPct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent donations + recent updates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" /> {d.recentDonations}
          </h2>
          {recentDonations.length === 0 ? (
            <p className="text-sm text-gray-400">{d.noDonationsYet}</p>
          ) : (
            <ul className="space-y-3">
              {recentDonations.map((d2) => {
                const name = d2.donor_name ?? dict.detail.anonymous;
                return (
                  <li key={d2.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</p>
                      <p className="text-xs text-gray-400">{timeAgo(d2.created_at)}</p>
                    </div>
                    <span className="text-sm font-bold text-brand-600 flex-shrink-0">
                      {formatMoney(d2.amount)} so&apos;m
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-brand-600" /> {d.recentUpdatesLbl}
          </h2>
          {recentUpdates.length === 0 ? (
            <p className="text-sm text-gray-400">{d.noUpdatesYet}</p>
          ) : (
            <ul className="space-y-3">
              {recentUpdates.map((u) => (
                <li key={u.id} className="flex items-start gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.title}</p>
                    <p className="text-xs text-gray-400">{timeAgo(u.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
