'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CheckCircle2, FileText, Pencil, Trash2, Loader2, ExternalLink, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CompletionReportForm, type EditableReport } from '@/components/campaigns/CompletionReportForm';
import { ImageGrid } from '@/components/ui/Gallery';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney } from '@/lib/utils';
import type { FundBreakdownItem, TimelineItem, BeneficiaryStatus, ReportStatus } from '@/types';

export interface ReportRow {
  id: string;
  title: string;
  message: string;
  images: string[];
  documents: string[];
  videos: string[];
  before_images: string[];
  after_images: string[];
  fund_breakdown: FundBreakdownItem[];
  timeline: TimelineItem[];
  beneficiary_status: BeneficiaryStatus | null;
  status: ReportStatus;
  admin_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface Props {
  report: ReportRow | null;
  isOwner: boolean;
  campaignId: string;
  userId: string;
  raised: number;
  withdrawn: number;
  /** Campaign's original images — fallback for the before/after pair. */
  beforeImages?: string[];
}

function docExt(url: string): string {
  const ext = url.split('?')[0].split('.').pop() ?? '';
  return ext.length <= 5 ? ext.toUpperCase() : 'FILE';
}

export function CompletionReports({ report, isOwner, campaignId, userId, raised, withdrawn, beforeImages }: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!report) return null;

  const benLabel: Record<string, string> = {
    successfully_completed: t('ux.benSuccess'),
    ongoing_recovery: t('ux.benRecovery'),
    project_finished: t('ux.benFinished'),
    project_delayed: t('ux.benDelayed'),
    other: t('ux.benOther'),
  };

  const remove = async () => {
    if (!window.confirm(t('ux.reportDeleteConfirm'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/reports?id=${report.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(t('ux.error')); return; }
      toast.success(t('ux.reportDeleted'));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  // Owner editing (create/changes-requested/rejected/edit-pending).
  if (editing) {
    const editable: EditableReport = {
      id: report.id, title: report.title, message: report.message,
      images: report.images, documents: report.documents, videos: report.videos,
      before_images: report.before_images, after_images: report.after_images,
      fund_breakdown: report.fund_breakdown, timeline: report.timeline,
      beneficiary_status: report.beneficiary_status,
    };
    return (
      <section className="mt-8">
        <CompletionReportForm campaignId={campaignId} userId={userId} totalWithdrawn={withdrawn} report={editable} onDone={() => setEditing(false)} />
      </section>
    );
  }

  // ── Owner-only moderation banner for a non-approved report ──────────────────
  if (report.status !== 'approved') {
    const banners: Record<string, { Icon: typeof Clock; cls: string; label: string }> = {
      pending: { Icon: Clock, cls: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/40 text-yellow-700 dark:text-yellow-400', label: t('ux.reportPending') },
      changes_requested: { Icon: AlertTriangle, cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400', label: t('ux.reportChanges') },
      rejected: { Icon: AlertTriangle, cls: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400', label: t('ux.reportRejected') },
    };
    const map = banners[report.status] ?? banners.pending;
    return (
      <section className="mt-8">
        <div className={`card p-5 border ${map.cls}`}>
          <div className="flex items-start gap-3">
            <map.Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{map.label}</p>
              <p className="text-sm mt-0.5 text-gray-600 dark:text-gray-300 break-words">{report.title}</p>
              {report.admin_feedback && (
                <p className="text-sm mt-2 text-gray-700 dark:text-gray-200 break-words"><strong>{t('ux.adminFeedback')}:</strong> {report.admin_feedback}</p>
              )}
              {report.status !== 'pending' && (
                <button onClick={() => setEditing(true)} className="btn-primary mt-3 px-4 py-2 text-sm">
                  <Pencil className="w-4 h-4" /> {t('ux.reportEdit')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Approved → public Fund Usage Report ─────────────────────────────────────
  const reported = report.fund_breakdown.reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = Math.max(0, withdrawn - reported);
  const completionDate = new Date(report.reviewed_at ?? report.created_at).toLocaleDateString(locale);
  const before = report.before_images.length ? report.before_images[0] : beforeImages?.[0];
  const after = report.after_images.length ? report.after_images[0] : report.images[0];

  const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
    <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-black break-words ${accent ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  );

  return (
    <section className="mt-8">
      <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600" /> {t('ux.fundUsageReport')}
      </h2>

      <article className="card overflow-hidden">
        {/* Header */}
        <div className="bg-green-50 dark:bg-green-900/20 px-6 py-4 flex items-start justify-between gap-3 border-b border-green-100 dark:border-green-900/30">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('ux.reportAvailable')}
            </span>
            <h3 className="text-lg font-black text-gray-900 dark:text-white mt-1 leading-snug">{report.title}</h3>
            <time className="text-xs text-gray-400">{completionDate}</time>
          </div>
          {isOwner && (
            <button onClick={remove} disabled={busy} className="p-2 rounded-lg text-gray-400 hover:text-red-600 transition-colors" title={t('ux.reportDelete')} aria-label={t('ux.reportDelete')}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* Transparency */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label={t('ux.fundsRaised')} value={`${formatMoney(raised)} so'm`} />
            <Stat label={t('ux.fundsWithdrawn')} value={`${formatMoney(withdrawn)} so'm`} />
            <Stat label={t('ux.fundsReported')} value={`${formatMoney(reported)} so'm`} />
            <Stat label={t('ux.completionDate')} value={completionDate} />
            <Stat label={t('ux.verificationStatus')} value={t('ux.reportVerified')} accent />
            {report.beneficiary_status && <Stat label={t('ux.beneficiaryStatus')} value={benLabel[report.beneficiary_status] ?? report.beneficiary_status} />}
          </div>
          {remaining > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('ux.remainingNotReported')} ({formatMoney(remaining)} so&apos;m)</p>
          )}

          {/* Summary */}
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">{report.message}</p>

          {/* Before / After */}
          {before && after && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ux.beforeAfter')}</p>
              <ImageGrid images={[before, after]} labels={[t('ux.before'), t('ux.after')]} cols={2} />
            </div>
          )}

          {/* Fund usage breakdown */}
          {report.fund_breakdown.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ux.fundBreakdown')}</p>
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {report.fund_breakdown.map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.category}</p>
                      {item.description && <p className="text-xs text-gray-500 break-words">{item.description}</p>}
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white flex-shrink-0">{formatMoney(item.amount)} so&apos;m</p>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{t('ux.fundsReported')}</p>
                  <p className="text-sm font-black text-green-600">{formatMoney(reported)} so&apos;m</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          {report.timeline.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ux.timelineLbl')}</p>
              <ol className="relative ml-2 border-l-2 border-gray-100 dark:border-gray-800 space-y-3">
                {report.timeline.map((m, i) => (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.label}</p>
                    <p className="text-xs text-gray-400">{m.date ? new Date(m.date).toLocaleDateString(locale) : ''}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Gallery */}
          {report.images.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ux.galleryLbl')}</p>
              <ImageGrid images={report.images} />
            </div>
          )}

          {/* Videos — inline players so visitors never need to download */}
          {report.videos.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ux.videosLbl')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {report.videos.map((v, i) => (
                  <video key={i} src={v} controls preload="metadata" className="w-full rounded-xl bg-black" />
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {report.documents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('ux.documents')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {report.documents.map((doc, i) => (
                  <a key={i} href={doc} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-400 transition-colors">
                    <span className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-brand-600" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{t('ux.documents')} {i + 1}</span>
                      <span className="block text-xs text-gray-400">{docExt(doc)}</span>
                    </span>
                    <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
