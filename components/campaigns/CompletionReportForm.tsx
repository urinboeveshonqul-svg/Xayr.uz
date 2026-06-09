'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, ImagePlus, FileText, X, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MAX = 5 * 1024 * 1024; // 5MB per file

interface EditableReport {
  id: string;
  title: string;
  message: string;
  images: string[];
  documents: string[];
}

/**
 * Owner-only completion report editor. Creates a report (POST) or, when `report`
 * is provided, edits it (PATCH) — both via the existing /api/campaigns/reports
 * route (which re-checks ownership + completed status). Files upload to the
 * public `campaign-reports` bucket under {userId}/... (bucket RLS).
 */
export function CompletionReportForm({
  campaignId,
  userId,
  report,
  onDone,
}: {
  campaignId: string;
  userId: string;
  report?: EditableReport;
  onDone?: () => void;
}) {
  const router = useRouter();
  const isEdit = !!report;
  const [title, setTitle] = useState(report?.title ?? '');
  const [message, setMessage] = useState(report?.message ?? '');
  const [images, setImages] = useState<string[]>(report?.images ?? []);
  const [documents, setDocuments] = useState<string[]>(report?.documents ?? []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const upload = async (file: File, kind: 'image' | 'doc') => {
    if (file.size > MAX) {
      toast.error('Max 5MB');
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${userId}/${campaignId}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('campaign-reports')
        .upload(path, file, { upsert: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data } = supabase.storage.from('campaign-reports').getPublicUrl(path);
      if (kind === 'image') setImages((p) => [...p, data.publicUrl]);
      else setDocuments((p) => [...p, data.publicUrl]);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || message.trim().length < 10) {
      toast.error("Sarlavha (3+) va xabar (10+) to'ldirilishi shart");
      return;
    }
    setSubmitting(true);
    try {
      // Same route for both flows — POST creates, PATCH edits (existing API).
      const res = await fetch('/api/campaigns/reports', {
        method: report ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          report
            ? { id: report.id, title, message, images, documents }
            : { campaignId, title, message, images, documents }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Xatolik yuz berdi');
        return;
      }
      toast.success(report ? 'Hisobot yangilandi' : 'Yakuniy hisobot chop etildi');
      if (report) {
        onDone?.();
      } else {
        setTitle('');
        setMessage('');
        setImages([]);
        setDocuments([]);
      }
      router.refresh();
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={`card p-6 ${isEdit ? '' : 'mt-8'}`}>
      <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        {isEdit ? 'Hisobotni tahrirlash' : 'Yakuniy hisobot chop etish'}
      </h2>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Sarlavha</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder="Masalan: Operatsiya muvaffaqiyatli o'tdi"
          />
        </div>

        <div>
          <label className="label">Xabar</label>
          <textarea
            rows={5}
            className="input resize-none"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            placeholder="Yig'ilgan mablag' qanday ishlatilgani haqida yozing..."
          />
        </div>

        {/* Images */}
        <div>
          <label className="label">Rasmlar (ixtiyoriy)</label>
          <div className="flex flex-wrap gap-3">
            {images.map((src, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="O'chirish"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer text-gray-400 hover:border-brand-400">
              <ImagePlus className="w-6 h-6" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f, 'image');
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {/* Documents */}
        <div>
          <label className="label">Hujjatlar (ixtiyoriy)</label>
          <div className="flex flex-wrap gap-2 items-center">
            {documents.map((doc, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm">
                <FileText className="w-4 h-4 text-gray-500" />
                Hujjat {i + 1}
                <button
                  type="button"
                  onClick={() => setDocuments((p) => p.filter((_, idx) => idx !== i))}
                  aria-label="O'chirish"
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 cursor-pointer hover:border-brand-400">
              <FileText className="w-4 h-4" />
              Qo&apos;shish
              <input
                type="file"
                accept=".pdf,.doc,.docx,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f, 'doc');
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          {isEdit && (
            <button type="button" onClick={onDone} className="btn-ghost py-3">
              Bekor qilish
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || uploading}
            className="btn-primary py-3 text-base"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Saqlanmoqda...</>
            ) : uploading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Yuklanmoqda...</>
            ) : (
              isEdit ? 'Saqlash' : 'Hisobotni chop etish'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
