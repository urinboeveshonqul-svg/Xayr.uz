'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Loader2, Check, X, CalendarClock, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney, getProgress } from '@/lib/utils';
import type { CampaignExtensionRequest } from '@/types';

export interface ExtensionRow extends CampaignExtensionRequest {
  campaign_title: string | null;
  campaign_slug: string | null;
  owner_name: string | null;
  owner_email: string | null;
  goal_amount: number;
  current_amount: number;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  approved: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
};

export function AdminExtensions({ initialRows, locale }: { initialRows: ExtensionRow[]; locale: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ExtensionRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    pending: t('admin.extStPending'),
    approved: t('admin.extStApproved'),
    rejected: t('admin.extStRejected'),
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await createClient().rpc('approve_campaign_extension', { p_request_id: id });
      if (error) { toast.error(error.message); return; }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)));
      toast.success(t('admin.extApproved'));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt(t('admin.extRejectReason'));
    if (reason === null) return; // cancelled
    if (!reason.trim()) { toast.error(t('admin.extReasonRequired')); return; }
    setBusyId(id);
    try {
      const { error } = await createClient().rpc('reject_campaign_extension', { p_request_id: id, p_note: reason.trim() });
      if (error) { toast.error(error.message); return; }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'rejected', admin_note: reason.trim() } : r)));
      toast.success(t('admin.extRejected'));
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return <div className="card p-12 text-center text-gray-400">{t('admin.extEmpty')}</div>;
  }

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(locale) : '—');

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const busy = busyId === r.id;
        const pct = getProgress(r.current_amount, r.goal_amount);
        return (
          <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`badge ${STATUS_BADGE[r.status] ?? ''}`}>{statusLabel[r.status] ?? r.status}</span>
              </div>
              <p className="font-semibold text-gray-900 dark:text-white truncate">{r.campaign_title ?? '—'}</p>
              <p className="text-xs text-gray-400 truncate">
                {r.owner_name ?? r.owner_email ?? '—'} · {formatMoney(r.current_amount)}/{formatMoney(r.goal_amount)} so&apos;m ({pct}%)
              </p>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1 flex-wrap">
                <CalendarClock className="w-3 h-3 flex-shrink-0" />
                {t('admin.extPrevDeadline')}: {fmtDate(r.previous_deadline)} → {t('admin.extNewDeadline')}: {fmtDate(r.requested_deadline)}
              </p>
              {r.admin_note && <p className="text-xs text-red-500 mt-1 break-words">{r.admin_note}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {r.campaign_slug && (
                <Link
                  href={`/${locale}/campaigns/${r.campaign_slug}`}
                  target="_blank"
                  className="btn-ghost p-2 border border-gray-200 dark:border-gray-700"
                  title={t('admin.view')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
              )}
              {r.status === 'pending' && (
                <>
                  <button
                    onClick={() => approve(r.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t('admin.extApprove')}
                  </button>
                  <button
                    onClick={() => reject(r.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> {t('admin.extReject')}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
