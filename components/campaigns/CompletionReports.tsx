'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CheckCircle2, FileText, Pencil, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { CompletionReportForm } from '@/components/campaigns/CompletionReportForm';
import { ImageGrid } from '@/components/ui/Gallery';
import { useI18n } from '@/components/i18n/I18nProvider';

interface ReportRow {
  id: string;
  title: string;
  message: string;
  images: string[];
  documents: string[];
  created_at: string;
}

interface Props {
  reports: ReportRow[];
  isOwner: boolean;
  campaignId: string;
  userId: string;
  /** Campaign's original images — used for the Avval/Keyin (before/after) pair. */
  beforeImages?: string[];
}

function docExt(url: string): string {
  const clean = url.split('?')[0];
  const ext = clean.split('.').pop() ?? '';
  return ext.length <= 5 ? ext.toUpperCase() : 'FILE';
}

export function CompletionReports({ reports, isOwner, campaignId, userId, beforeImages }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (reports.length === 0) return null;

  const remove = async (id: string) => {
    if (!window.confirm("Hisobotni o'chirmoqchimisiz?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/campaigns/reports?id=${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Xatolik yuz berdi');
        return;
      }
      toast.success("Hisobot o'chirildi");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        {t('ux.reportsTitle')}
      </h2>

      <div className="space-y-6">
        {reports.map((r) =>
          editingId === r.id ? (
            <CompletionReportForm
              key={r.id}
              campaignId={campaignId}
              userId={userId}
              report={r}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <article key={r.id} className="card overflow-hidden">
              {/* Header band */}
              <div className="bg-green-50 dark:bg-green-900/20 px-6 py-4 flex items-start justify-between gap-3 border-b border-green-100 dark:border-green-900/30">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t('ux.completedLbl')}
                  </span>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mt-1 leading-snug">
                    {r.title}
                  </h3>
                  <time className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString('uz-UZ')}
                  </time>
                </div>

                {isOwner && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingId(r.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                      title="Tahrirlash"
                      aria-label="Tahrirlash"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      disabled={busyId === r.id}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                      title="O'chirish"
                      aria-label="O'chirish"
                    >
                      {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="p-6 space-y-5">
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                  {r.message}
                </p>

                {/* Before / After — campaign's original image vs the report's result */}
                {beforeImages && beforeImages.length > 0 && r.images.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      {t('ux.beforeAfter')}
                    </p>
                    <ImageGrid
                      images={[beforeImages[0], r.images[0]]}
                      labels={[t('ux.before'), t('ux.after')]}
                      cols={2}
                    />
                  </div>
                )}

                {/* Image gallery */}
                {r.images.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      {t('ux.galleryLbl')}
                    </p>
                    <ImageGrid images={r.images} />
                  </div>
                )}

                {/* Document viewer */}
                {r.documents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('ux.documents')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {r.documents.map((doc, i) => (
                        <a
                          key={i}
                          href={doc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-900/10 transition-colors"
                        >
                          <span className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-brand-600" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">
                              Hujjat {i + 1}
                            </span>
                            <span className="block text-xs text-gray-400">
                              {docExt(doc)} · Ko&apos;rish uchun bosing
                            </span>
                          </span>
                          <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          )
        )}
      </div>

    </section>
  );
}
