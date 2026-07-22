'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, ImagePlus, FileText, Video, X, CheckCircle2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import { useI18n } from '@/components/i18n/I18nProvider';
import { fileExtension, isAcceptedImageMime, uploadErrorKey, uploadToStorage } from '@/lib/image-upload';
import type { FundBreakdownItem, TimelineItem, BeneficiaryStatus } from '@/types';

const IMG_MAX = 5 * 1024 * 1024;   // 5MB per image/doc
const VID_MAX = 50 * 1024 * 1024;  // 50MB per video

const MIN_SUMMARY = 200;

const BENEFICIARY_OPTIONS: { value: BeneficiaryStatus; label: string }[] = [
  { value: 'successfully_completed', label: 'Muvaffaqiyatli yakunlandi' },
  { value: 'ongoing_recovery', label: 'Tiklanish davom etmoqda' },
  { value: 'project_finished', label: 'Loyiha tugatildi' },
  { value: 'project_delayed', label: 'Loyiha kechiktirildi' },
  { value: 'other', label: 'Boshqa' },
];

export interface EditableReport {
  id: string;
  title: string;
  message: string;
  images: string[];
  documents: string[];
  videos?: string[];
  before_images?: string[];
  after_images?: string[];
  fund_breakdown?: FundBreakdownItem[];
  timeline?: TimelineItem[];
  beneficiary_status?: BeneficiaryStatus | null;
}

/**
 * Owner completion-report editor. Submits a MODERATED report (POST creates,
 * PATCH edits) via /api/campaigns/reports — the server forces it to 'pending'
 * for admin review. Fund-usage total must not exceed `totalWithdrawn`.
 */
export function CompletionReportForm({
  campaignId,
  userId,
  totalWithdrawn = 0,
  report,
  onDone,
}: {
  campaignId: string;
  userId: string;
  totalWithdrawn?: number;
  report?: EditableReport;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const isEdit = !!report;
  const [title, setTitle] = useState(report?.title ?? '');
  const [message, setMessage] = useState(report?.message ?? '');
  const [images, setImages] = useState<string[]>(report?.images ?? []);
  const [documents, setDocuments] = useState<string[]>(report?.documents ?? []);
  const [videos, setVideos] = useState<string[]>(report?.videos ?? []);
  const [beforeImages, setBeforeImages] = useState<string[]>(report?.before_images ?? []);
  const [afterImages, setAfterImages] = useState<string[]>(report?.after_images ?? []);
  const [fundBreakdown, setFundBreakdown] = useState<FundBreakdownItem[]>(report?.fund_breakdown ?? []);
  const [timeline, setTimeline] = useState<TimelineItem[]>(report?.timeline ?? []);
  const [beneficiary, setBeneficiary] = useState<BeneficiaryStatus | ''>(report?.beneficiary_status ?? '');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reportedTotal = fundBreakdown.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const overCap = totalWithdrawn > 0 && reportedTotal > totalWithdrawn;

  const upload = async (
    file: File,
    folder: string,
    push: (url: string) => void,
    opts: { isVideo?: boolean; imageOnly?: boolean } = {},
  ) => {
    const { isVideo = false, imageOnly = false } = opts;
    if (file.size > (isVideo ? VID_MAX : IMG_MAX)) {
      toast.error(isVideo ? 'Video maks. 50MB' : 'Maks. 5MB');
      return;
    }
    // Reject an unsupported image format up front (e.g. an Android HEIC/HEIF photo)
    // only where the input is image-only; doc/video slots accept other types.
    if (imageOnly && file.type && !isAcceptedImageMime(file.type)) {
      toast.error(t('toasts.imageUnsupportedFormat'));
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${userId}/${campaignId}/${folder}-${Date.now()}.${fileExtension(file, 'bin')}`;
      await uploadToStorage(supabase, 'campaign-reports', path, file, { upsert: true });
      const { data } = supabase.storage.from('campaign-reports').getPublicUrl(path);
      push(data.publicUrl);
    } catch (err) {
      toast.error(t(uploadErrorKey(err)));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) { toast.error(t('toasts.reportTitleShort')); return; }
    if (message.trim().length < MIN_SUMMARY) {
      toast.error(t('toasts.reportSummaryMin', { n: MIN_SUMMARY }));
      return;
    }
    if (overCap) { toast.error(t('toasts.reportSumExceeds')); return; }
    // Drop incomplete fund-breakdown rows.
    const cleanFund = fundBreakdown
      .filter((i) => i.category.trim() && (Number(i.amount) || 0) >= 0)
      .map((i) => ({ category: i.category.trim(), description: i.description.trim(), amount: Math.floor(Number(i.amount) || 0) }));
    const cleanTimeline = timeline.filter((t) => t.label.trim() && t.date).map((t) => ({ label: t.label.trim(), date: t.date }));

    setSubmitting(true);
    try {
      const payload = {
        title, message,
        images, documents, videos,
        before_images: beforeImages, after_images: afterImages,
        fund_breakdown: cleanFund, timeline: cleanTimeline,
        beneficiary_status: beneficiary || null,
      };
      const res = await fetch('/api/campaigns/reports', {
        method: report ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report ? { id: report.id, ...payload } : { campaignId, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {
          reported_exceeds_withdrawn: t('toasts.reportErrExceedsWithdrawn'),
          report_locked: t('toasts.reportErrLocked'),
        };
        toast.error(map[json.error] ?? json.error ?? t('toasts.generic'));
        return;
      }
      toast.success(report ? t('toasts.reportSubmittedReview') : t('toasts.reportSubmittedFinal'));
      if (report) onDone?.();
      router.refresh();
    } catch {
      toast.error(t('toasts.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const thumb = (list: string[], setList: (u: string[]) => void) =>
    list.map((src, i) => (
      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="w-full h-full object-cover" />
        <button type="button" onClick={() => setList(list.filter((_, idx) => idx !== i))}
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center" aria-label="O'chirish">
          <X className="w-3 h-3" />
        </button>
      </div>
    ));

  const imgInput = (folder: string, push: (u: string) => void) => (
    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer text-gray-400 hover:border-brand-400">
      <ImagePlus className="w-6 h-6" />
      <input type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, folder, push, { imageOnly: true }); e.target.value = ''; }} />
    </label>
  );

  return (
    <section className={`card p-6 ${isEdit ? '' : 'mt-8'}`}>
      <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 mb-1">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        {isEdit ? 'Hisobotni tahrirlash' : 'Yakuniy hisobot'}
      </h2>
      <p className="text-xs text-gray-400 mb-4">Mablag&apos; qanday ishlatilganini ko&apos;rsating. Admin ko&apos;rib chiqadi.</p>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label">Sarlavha</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160}
            placeholder="Masalan: Bemor muvaffaqiyatli operatsiya qildi" />
        </div>

        <div>
          <label className="label">Xulosa (kamida {MIN_SUMMARY} belgi)</label>
          <textarea rows={6} className="input resize-none" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000}
            placeholder="Nimaga erishildi, xayriyalar qanday ishlatildi, yakuniy natija va minnatdorchilik..." />
          <p className={`text-xs mt-1 ${message.trim().length < MIN_SUMMARY ? 'text-red-500' : 'text-gray-400'}`}>
            {message.trim().length} / {MIN_SUMMARY}
          </p>
        </div>

        {/* Fund usage breakdown */}
        <div>
          <label className="label">Mablag&apos; sarfi</label>
          <div className="space-y-2">
            {fundBreakdown.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input className="input col-span-4" placeholder="Kategoriya" value={item.category}
                  onChange={(e) => setFundBreakdown(fundBreakdown.map((x, idx) => idx === i ? { ...x, category: e.target.value } : x))} />
                <input className="input col-span-5" placeholder="Tavsif" value={item.description}
                  onChange={(e) => setFundBreakdown(fundBreakdown.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} />
                <input className="input col-span-2" type="number" min={0} placeholder="Summa" value={item.amount || ''}
                  onChange={(e) => setFundBreakdown(fundBreakdown.map((x, idx) => idx === i ? { ...x, amount: Number(e.target.value) } : x))} />
                <button type="button" className="col-span-1 text-gray-400 hover:text-red-500 flex items-center justify-center"
                  onClick={() => setFundBreakdown(fundBreakdown.filter((_, idx) => idx !== i))} aria-label="O'chirish">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button type="button" className="btn-ghost text-sm" onClick={() => setFundBreakdown([...fundBreakdown, { category: '', description: '', amount: 0 }])}>
              <Plus className="w-4 h-4" /> Qator qo&apos;shish
            </button>
          </div>
          <div className={`mt-2 text-sm font-semibold flex items-center justify-between ${overCap ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'}`}>
            <span>Jami hisobot: {formatMoney(reportedTotal)} so&apos;m</span>
            {totalWithdrawn > 0 && <span className="text-xs text-gray-400">Yechilgan: {formatMoney(totalWithdrawn)} so&apos;m</span>}
          </div>
          {overCap && <p className="text-xs text-red-500 mt-1">Hisobot summasi yechib olingan summadan oshmasligi kerak.</p>}
        </div>

        {/* Beneficiary status */}
        <div>
          <label className="label">Holat</label>
          <select className="input" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value as BeneficiaryStatus | '')}>
            <option value="">—</option>
            {BENEFICIARY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Timeline */}
        <div>
          <label className="label">Vaqt jadvali (ixtiyoriy)</label>
          <div className="space-y-2">
            {timeline.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input className="input col-span-7" placeholder="Bosqich" value={item.label}
                  onChange={(e) => setTimeline(timeline.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} />
                <input className="input col-span-4" type="date" value={item.date}
                  onChange={(e) => setTimeline(timeline.map((x, idx) => idx === i ? { ...x, date: e.target.value } : x))} />
                <button type="button" className="col-span-1 text-gray-400 hover:text-red-500 flex items-center justify-center"
                  onClick={() => setTimeline(timeline.filter((_, idx) => idx !== i))} aria-label="O'chirish">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button type="button" className="btn-ghost text-sm" onClick={() => setTimeline([...timeline, { label: '', date: '' }])}>
              <Plus className="w-4 h-4" /> Bosqich qo&apos;shish
            </button>
          </div>
        </div>

        {/* Images */}
        <div>
          <label className="label">Rasmlar (ixtiyoriy)</label>
          <div className="flex flex-wrap gap-3">{thumb(images, setImages)}{imgInput('image', (u) => setImages((p) => [...p, u]))}</div>
        </div>

        {/* Before / After */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Avval (ixtiyoriy)</label>
            <div className="flex flex-wrap gap-3">{thumb(beforeImages, setBeforeImages)}{imgInput('before', (u) => setBeforeImages((p) => [...p, u]))}</div>
          </div>
          <div>
            <label className="label">Keyin (ixtiyoriy)</label>
            <div className="flex flex-wrap gap-3">{thumb(afterImages, setAfterImages)}{imgInput('after', (u) => setAfterImages((p) => [...p, u]))}</div>
          </div>
        </div>

        {/* Videos */}
        <div>
          <label className="label">Videolar (ixtiyoriy)</label>
          <div className="flex flex-wrap gap-2 items-center">
            {videos.map((v, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm">
                <Video className="w-4 h-4 text-gray-500" /> Video {i + 1}
                <button type="button" onClick={() => setVideos(videos.filter((_, idx) => idx !== i))} aria-label="O'chirish" className="text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 cursor-pointer hover:border-brand-400">
              <Video className="w-4 h-4" /> Qo&apos;shish
              <input type="file" accept="video/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'video', (u) => setVideos((p) => [...p, u]), { isVideo: true }); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        {/* Documents */}
        <div>
          <label className="label">Hujjatlar (ixtiyoriy)</label>
          <div className="flex flex-wrap gap-2 items-center">
            {documents.map((doc, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm">
                <FileText className="w-4 h-4 text-gray-500" /> Hujjat {i + 1}
                <button type="button" onClick={() => setDocuments(documents.filter((_, idx) => idx !== i))} aria-label="O'chirish" className="text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 cursor-pointer hover:border-brand-400">
              <FileText className="w-4 h-4" /> Qo&apos;shish
              <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'doc', (u) => setDocuments((p) => [...p, u])); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          {isEdit && <button type="button" onClick={onDone} className="btn-ghost py-3">Bekor qilish</button>}
          <button type="submit" disabled={submitting || uploading || overCap} className="btn-primary py-3 text-base">
            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Yuborilmoqda...</>
              : uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> Yuklanmoqda...</>
              : isEdit ? 'Saqlash va qayta yuborish' : 'Ko\'rib chiqishga yuborish'}
          </button>
        </div>
      </form>
    </section>
  );
}
