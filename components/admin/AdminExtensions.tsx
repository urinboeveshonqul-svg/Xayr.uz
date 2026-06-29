'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Loader2, Check, X, CalendarClock, ExternalLink } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney } from '@/lib/utils';
import type { CampaignExtensionRequest } from '@/types';

export interface ExtensionRow extends CampaignExtensionRequest {
  campaign_title: string | null;
  campaign_slug: string | null;
  owner_name: string | null;
  owner_email: string | null;
  goal_amount: number;
  current_amount: number;
  extension_count: number;
}

const CATEGORY_KEY: Record<string, string> = {
  treatment: 'dash.extCatTreatment',
  construction: 'dash.extCatConstruction',
  emergency: 'dash.extCatEmergency',
  other: 'dash.extCatOther',
};

// Days between the previous deadline and the requested one (rounded up).
function additionalDays(prev: string | null, next: string): number {
  const base = prev ? new Date(prev).getTime() : Date.now();
  return Math.max(0, Math.ceil((new Date(next).getTime() - base) / 86400000));
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  approved: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

export function AdminExtensions({ initialRows, locale }: { initialRows: ExtensionRow[]; locale: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ExtensionRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    pending: t('admin.extStPending'),
    approved: t('admin.extStApproved'),
    rejected: t('admin.extStRejected'),
    cancelled: t('admin.extStCancelled'),
  };

  // Approve/reject go through the server route (not a direct RPC) so an approval
  // can revalidate the cached homepage — the reactivated campaign rejoins
  // featured/trending immediately, with no user action.
  const post = async (payload: { action: 'approve' | 'reject'; requestId: string; reason?: string }) => {
    const res = await fetch('/api/admin/extensions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: json.error };
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const { ok, error } = await post({ action: 'approve', requestId: id });
      if (!ok) { toast.error(error ?? 'Error'); return; }
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
      const { ok, error } = await post({ action: 'reject', requestId: id, reason: reason.trim() });
      if (!ok) { toast.error(error ?? 'Error'); return; }
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
        const remaining = Math.max(0, r.goal_amount - r.current_amount);
        return (
          <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`badge ${STATUS_BADGE[r.status] ?? ''}`}>{statusLabel[r.status] ?? r.status}</span>
                <span className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleDateString(locale)}</span>
              </div>
              <p className="font-semibold text-gray-900 dark:text-white truncate">{r.campaign_title ?? '—'}</p>
              <p className="text-xs text-gray-400 truncate">{r.owner_name ?? r.owner_email ?? '—'}</p>

              {/* Funding snapshot */}
              <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                <span className="text-gray-500">{t('admin.extRaised')}: <b className="text-gray-800 dark:text-gray-200">{formatMoney(r.current_amount)}</b></span>
                <span className="text-gray-500">{t('admin.extGoal')}: <b className="text-gray-800 dark:text-gray-200">{formatMoney(r.goal_amount)}</b></span>
                <span className="text-gray-500">{t('admin.extRemaining')}: <b className="text-gray-800 dark:text-gray-200">{formatMoney(remaining)}</b></span>
                <span className="text-gray-500">{t('admin.extPrevCount')}: <b className="text-gray-800 dark:text-gray-200">{r.extension_count}</b></span>
              </div>

              {/* Requested window */}
              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1 flex-wrap">
                <CalendarClock className="w-3 h-3 flex-shrink-0" />
                {fmtDate(r.previous_deadline)} → {fmtDate(r.requested_deadline)}
                <span className="text-brand-600 font-semibold">(+{additionalDays(r.previous_deadline, r.requested_deadline)} {t('admin.extDays')})</span>
              </p>

              {/* Reason */}
              {(r.reason || r.reason_category) && (
                <div className="mt-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2 text-xs">
                  {r.reason_category && (
                    <span className="inline-block mb-0.5 px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-semibold">
                      {t(CATEGORY_KEY[r.reason_category] ?? 'dash.extCatOther')}
                    </span>
                  )}
                  {r.reason && <p className="text-gray-600 dark:text-gray-300 break-words whitespace-pre-wrap">{r.reason}</p>}
                </div>
              )}

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
