'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Loader2, Check, X, RotateCcw, ExternalLink, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney } from '@/lib/utils';
import type { FundBreakdownItem, ReportStatus } from '@/types';

export interface ReportAdminRow {
  id: string;
  campaign_id: string;
  title: string;
  message: string;
  status: ReportStatus;
  fund_breakdown: FundBreakdownItem[];
  admin_feedback: string | null;
  created_at: string;
  images: string[];
  documents: string[];
  videos: string[];
  campaign_title: string | null;
  campaign_slug: string | null;
  owner_name: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  approved: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  changes_requested: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
};

const FILTERS: (ReportStatus | 'all')[] = ['pending', 'approved', 'changes_requested', 'rejected', 'all'];

export function AdminReports({ initialRows, locale }: { initialRows: ReportAdminRow[]; locale: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ReportAdminRow[]>(initialRows);
  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    pending: t('admin.repStPending'),
    approved: t('admin.repStApproved'),
    changes_requested: t('admin.repStChanges'),
    rejected: t('admin.repStRejected'),
    all: t('admin.stAll'),
  };

  const visible = rows.filter((r) => filter === 'all' || r.status === filter);

  const review = async (id: string, action: 'approve' | 'request_changes' | 'reject') => {
    let feedback: string | undefined;
    if (action !== 'approve') {
      const input = window.prompt(t('admin.repFeedbackPrompt'));
      if (input === null) return;
      if (!input.trim()) { toast.error(t('admin.repFeedbackRequired')); return; }
      feedback = input.trim();
    }
    setBusyId(id);
    try {
      const { error } = await createClient().rpc('review_completion_report', { p_id: id, p_action: action, p_feedback: feedback });
      if (error) { toast.error(error.message); return; }
      const next: ReportStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next, admin_feedback: feedback ?? r.admin_feedback } : r)));
      toast.success(t('admin.repReviewed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`badge cursor-pointer transition-all ${filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {statusLabel[f]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">{t('admin.repEmpty')}</div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const busy = busyId === r.id;
            const reported = r.fund_breakdown.reduce((s, i) => s + (i.amount || 0), 0);
            return (
              <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`badge ${STATUS_BADGE[r.status] ?? ''}`}>{statusLabel[r.status] ?? r.status}</span>
                    <span className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleDateString(locale)}</span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{r.title}</p>
                  <p className="text-xs text-gray-400 truncate">{r.campaign_title ?? '—'} · {r.owner_name ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('admin.repReported')}: <b className="text-gray-800 dark:text-gray-200">{formatMoney(reported)} so&apos;m</b>
                    <span className="mx-2">·</span>
                    <FileText className="w-3 h-3 inline" /> {r.images.length + r.documents.length + r.videos.length}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{r.message}</p>
                  {r.admin_feedback && <p className="text-xs text-amber-600 mt-1 break-words"><strong>{t('admin.repFeedback')}:</strong> {r.admin_feedback}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.campaign_slug && (
                    <Link href={`/${locale}/campaigns/${r.campaign_slug}`} target="_blank" className="btn-ghost p-2 border border-gray-200 dark:border-gray-700" title={t('admin.view')}>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  )}
                  {r.status !== 'approved' && (
                    <button onClick={() => review(r.id, 'approve')} disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t('admin.repApprove')}
                    </button>
                  )}
                  {r.status === 'pending' && (
                    <button onClick={() => review(r.id, 'request_changes')} disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50">
                      <RotateCcw className="w-3.5 h-3.5" /> {t('admin.repChanges')}
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button onClick={() => review(r.id, 'reject')} disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> {t('admin.repReject')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
