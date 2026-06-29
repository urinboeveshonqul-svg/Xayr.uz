'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Megaphone, Eye, Pencil, BarChart3, Wallet, MessagesSquare, RefreshCw, Loader2,
  PlusCircle, Users, TrendingUp, CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney, getProgress } from '@/lib/utils';
import type { CampaignStatus } from '@/types';

export interface MyCampaignRow {
  id: string;
  title: string;
  slug: string;
  status: CampaignStatus;
  image_url: string | null;
  current_amount: number;
  goal_amount: number;
  donors_count: number;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_CLS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pending:   'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  active:    'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  paused:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  rejected:  'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  completed: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  expired:   'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  funded:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

// Campaign History filters: active discovery first, then the archive states.
const FILTER_VALUES: (CampaignStatus | 'all')[] = ['all', 'active', 'expired', 'funded', 'completed', 'cancelled', 'pending', 'rejected'];

export function MyCampaigns({ campaigns, locale }: { campaigns: MyCampaignRow[]; locale: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = campaigns.filter((c) => filter === 'all' || c.status === filter);

  const statusLabel: Record<string, string> = {
    draft: t('dash.stDraft'),
    pending: t('dash.stPending'),
    active: t('dash.stActive'),
    paused: t('dash.stPaused'),
    rejected: t('dash.stRejected'),
    completed: t('dash.stCompleted'),
    expired: t('dash.stExpired'),
    funded: t('dash.stFunded'),
    cancelled: t('dash.stCancelled'),
  };
  const filterLabel: Record<string, string> = {
    all: t('dash.filterAll'),
    active: t('dash.stActive'),
    expired: t('dash.stExpired'),
    funded: t('dash.stFunded'),
    completed: t('dash.stCompleted'),
    cancelled: t('dash.stCancelled'),
    pending: t('dash.stPending'),
    rejected: t('dash.stRejected'),
  };

  // Dashboard cards — real values aggregated from the user's own campaigns.
  const stats = [
    { Icon: Megaphone, label: t('dash.totalCampaigns'), value: campaigns.length.toLocaleString('uz-UZ') },
    { Icon: CheckCircle2, label: t('dash.activeLbl'), value: campaigns.filter((c) => c.status === 'active').length.toLocaleString('uz-UZ') },
    { Icon: TrendingUp, label: t('dash.totalRaised'), value: `${formatMoney(campaigns.reduce((s, c) => s + c.current_amount, 0))} so'm` },
    { Icon: Users, label: t('dash.totalDonors'), value: campaigns.reduce((s, c) => s + c.donors_count, 0).toLocaleString('uz-UZ') },
  ];

  // rejected -> pending via the owner-only SECURITY DEFINER function.
  const resubmit = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await createClient().rpc('resubmit_campaign', { p_campaign_id: id });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('dash.resubmitOk'));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  // Empty state: first-campaign CTA.
  if (campaigns.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          {t('dash.emptyTitle')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          {t('dash.emptyHint')}
        </p>
        <Link href={`/${locale}/campaigns/create`} className="btn-primary px-6 py-3 inline-flex">
          <PlusCircle className="w-5 h-5" /> {t('dash.createCampaign')}
        </Link>
      </div>
    );
  }

  const action = (href: string, Icon: typeof Eye, label: string) => (
    <Link
      key={label}
      href={href}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </Link>
  );

  return (
    <div>
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {stats.map(({ Icon, label, value }) => (
          <div key={label} className="card p-4 text-center">
            <Icon className="w-4 h-4 text-brand-600 mx-auto mb-1.5" />
            <div className="text-base sm:text-lg font-black text-gray-900 dark:text-white break-words leading-tight">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_VALUES.map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`badge cursor-pointer transition-all ${
              filter === value
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {filterLabel[value]}
          </button>
        ))}
      </div>

      {/* Campaign rows */}
      {visible.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">{t('dash.noInStatus')}</div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const stCls = STATUS_CLS[c.status] ?? STATUS_CLS.pending;
            const stLabel = statusLabel[c.status] ?? statusLabel.pending;
            const pct = getProgress(c.current_amount, c.goal_amount);
            const view = `/${locale}/campaigns/${c.slug}`;
            return (
              <article key={c.id} className="card p-4">
                <div className="flex gap-4">
                  {/* Image */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Megaphone className="w-7 h-7" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-gray-900 dark:text-white truncate">{c.title}</p>
                      <span className={`badge flex-shrink-0 ${stCls}`}>{stLabel}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatMoney(c.current_amount)} / {formatMoney(c.goal_amount)} so&apos;m · {pct}% · {c.donors_count} donor · {new Date(c.created_at).toLocaleDateString('uz-UZ')}
                    </p>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Status-specific actions */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {action(view, Eye, t('dash.view'))}
                  {(c.status === 'active' || c.status === 'pending' || c.status === 'rejected' || c.status === 'draft') &&
                    action(`${view}/edit`, Pencil, t('dash.edit'))}
                  {c.status === 'active' && action(view, MessagesSquare, t('dash.updateLbl'))}
                  {['active', 'completed', 'expired', 'funded'].includes(c.status) &&
                    action(`${view}/analytics`, BarChart3, t('dash.analyticsLbl'))}
                  {['active', 'funded'].includes(c.status) && action(`${view}/withdraw`, Wallet, t('dash.withdrawLbl'))}
                  {c.status === 'completed' && action(view, CheckCircle2, t('dash.reportLbl'))}
                  {c.status === 'rejected' && (
                    <button
                      onClick={() => resubmit(c.id)}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-60"
                    >
                      {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      {t('dash.resubmit')}
                    </button>
                  )}
                </div>

                {c.status === 'rejected' && (
                  <p className="text-xs text-red-500 mt-2">
                    {c.rejection_reason
                      ? `${t('dash.rejectedReason')}: ${c.rejection_reason}`
                      : t('dash.rejectedHint')}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
