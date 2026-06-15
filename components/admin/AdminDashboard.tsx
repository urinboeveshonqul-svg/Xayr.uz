'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, ExternalLink, Clock, Loader2, Siren, Target, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, CATEGORY_CONFIG, timeAgo } from '@/lib/utils';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { Campaign } from '@/types';

interface AdminDashboardProps {
  pendingCampaigns: Campaign[];
}

export function AdminDashboard({ pendingCampaigns }: AdminDashboardProps) {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState<Campaign[]>(pendingCampaigns);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Rejection modal state — admins must enter a reason before rejecting.
  const [rejecting, setRejecting] = useState<Campaign | null>(null);
  const [reason, setReason] = useState('');

  const approve = async (id: string) => {
    setLoadingId(id);
    try {
      const { error } = await createClient().from('campaigns').update({ status: 'active' }).eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success(t('admin.approved'));
    } catch {
      toast.error(t('admin.unexpected'));
    } finally {
      setLoadingId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    if (!reason.trim()) {
      toast.error(t('admin.rejectReasonRequired'));
      return;
    }
    const id = rejecting.id;
    setLoadingId(id);
    try {
      const { error } = await createClient()
        .from('campaigns')
        .update({ status: 'rejected', rejection_reason: reason.trim() })
        .eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success(t('admin.rejectedToast'));
      setRejecting(null);
      setReason('');
    } catch {
      toast.error(t('admin.unexpected'));
    } finally {
      setLoadingId(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('admin.noPending')}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('admin.allReviewed')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <span className="badge bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
          <Clock className="w-3 h-3" />
          {t('admin.nPending').replace('{count}', String(campaigns.length))}
        </span>
      </div>

      {campaigns.map((campaign) => {
        const cat = CATEGORY_CONFIG[campaign.categories?.slug ?? 'other'];
        const isLoading = loadingId === campaign.id;

        return (
          <div key={campaign.id} className="card p-5">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative w-full sm:w-32 h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-400">
                {campaign.image_url ? (
                  <Image src={campaign.image_url} alt={campaign.title} fill className="object-cover" sizes="128px" />
                ) : (
                  <cat.Icon className="w-8 h-8" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start gap-2 mb-1">
                  <span className={`badge ${cat.color}`}>
                    <cat.Icon className="w-3.5 h-3.5" /> {cat.label}
                  </span>
                  {campaign.is_urgent && (
                    <span className="badge bg-red-500 text-white"><Siren className="w-3 h-3" /> {t('admin.urgent')}</span>
                  )}
                </div>

                <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug mb-1 truncate">
                  {campaign.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{campaign.description}</p>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {t('admin.goal')}: {formatMoney(campaign.goal_amount)} so&apos;m</span>
                  {campaign.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {campaign.location}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {timeAgo(campaign.created_at)}</span>
                </div>
              </div>

              <div className="flex sm:flex-col gap-2 flex-shrink-0">
                <Link
                  href={`/campaigns/${campaign.slug}`}
                  target="_blank"
                  className="btn-ghost text-xs gap-1 border border-gray-200 dark:border-gray-700"
                  title={t('admin.view')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('admin.view')}
                </Link>

                <button
                  onClick={() => approve(campaign.id)}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  {t('admin.approve')}
                </button>

                <button
                  onClick={() => { setRejecting(campaign); setReason(''); }}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {t('admin.reject')}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Rejection reason modal */}
      {rejecting && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setRejecting(null)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 animate-pop max-h-[90vh] overflow-y-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t('admin.rejectTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 truncate">{rejecting.title}</p>
            <label className="label">{t('admin.rejectReasonLabel')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder={t('admin.rejectReasonPlaceholder')}
              className="input resize-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejecting(null)} className="btn-ghost px-4 py-2">{t('admin.cancel')}</button>
              <button
                onClick={confirmReject}
                disabled={loadingId === rejecting.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {loadingId === rejecting.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                {t('admin.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
