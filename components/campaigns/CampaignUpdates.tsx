'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Loader2, Megaphone, Plus, Send, X, ImagePlus, FileText, Pencil, Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { timeAgo } from '@/lib/utils';
import { ImageGrid } from '@/components/ui/Gallery';
import { fileExtension, isAcceptedImageMime, uploadErrorKey, uploadToStorage } from '@/lib/image-upload';

const MAX = 5 * 1024 * 1024; // 5MB per file
// Reuse the existing public own-folder bucket (same one completion reports use).
const BUCKET = 'campaign-reports';

interface UpdateRow {
  id: string;
  title: string;
  content: string;
  images: string[];
  documents: string[];
  created_at: string;
}

interface CampaignUpdatesProps {
  campaignId: string;
  campaignUserId: string;
  isOwner: boolean;
  initialUpdates: UpdateRow[];
}

export function CampaignUpdates({
  campaignId,
  isOwner,
  initialUpdates,
}: CampaignUpdatesProps) {
  const { t } = useI18n();
  const [updates, setUpdates] = useState<UpdateRow[]>(initialUpdates);

  // Form state (shared by create + edit; editingId === null means "create").
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('campaign_updates')
      .select('id, title, content, images, documents, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    setUpdates(data ?? []);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setImages([]);
    setDocuments([]);
    setFormOpen(false);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (u: UpdateRow) => {
    setEditingId(u.id);
    setTitle(u.title);
    setContent(u.content);
    setImages(u.images ?? []);
    setDocuments(u.documents ?? []);
    setFormOpen(true);
  };

  const upload = async (file: File, kind: 'image' | 'doc') => {
    if (file.size > MAX) {
      toast.error(t('toasts.max5mb'));
      return;
    }
    // Reject an unsupported image format up front (e.g. an Android HEIC/HEIF photo);
    // the document slot accepts PDF/DOC too, so only guard the image input.
    if (kind === 'image' && file.type && !isAcceptedImageMime(file.type)) {
      toast.error(t('toasts.imageUnsupportedFormat'));
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('toasts.authRequired'));
        return;
      }
      const path = `${user.id}/${campaignId}/update-${kind}-${Date.now()}.${fileExtension(file, 'bin')}`;
      await uploadToStorage(supabase, BUCKET, path, file, { upsert: true });
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (kind === 'image') setImages((p) => [...p, data.publicUrl]);
      else setDocuments((p) => [...p, data.publicUrl]);
    } catch (err) {
      toast.error(t(uploadErrorKey(err)));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 1 || content.trim().length < 1) {
      toast.error(t('toasts.updateFieldsRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('toasts.authRequired'));
        return;
      }

      if (editingId) {
        const { error } = await supabase
          .from('campaign_updates')
          .update({ title: title.trim(), content: content.trim(), images, documents })
          .eq('id', editingId);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(t('toasts.updateEdited'));
      } else {
        const { error } = await supabase.from('campaign_updates').insert({
          campaign_id: campaignId,
          user_id: user.id,
          title: title.trim(),
          content: content.trim(),
          images,
          documents,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(t('toasts.updateAdded'));
      }

      resetForm();
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Yangilikni o'chirmoqchimisiz?")) return;
    setBusyId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('campaign_updates').delete().eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('toasts.updateDeleted'));
      setUpdates((p) => p.filter((u) => u.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-brand-600" />
          {t('ux.updatesTitle')}
          {updates.length > 0 && (
            <span className="text-base font-semibold text-gray-400">({updates.length})</span>
          )}
        </h2>

        {isOwner && !formOpen && (
          <button onClick={openCreate} className="btn-primary px-4 py-2 text-sm">
            <Plus className="w-4 h-4" />
            {t('ux.addUpdate')}
          </button>
        )}
      </div>

      {/* Create / edit form — owner only */}
      {isOwner && formOpen && (
        <form onSubmit={submit} className="card p-5 mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Yangilikni tahrirlash' : 'Yangi yangilik'}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Yopish"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            type="text"
            placeholder="Sarlavha"
            maxLength={200}
            className="input"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Yangilik matni..."
            className="input resize-none"
          />

          {/* Photos */}
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

          {/* Receipts / documents */}
          <div>
            <label className="label">Cheklar / hujjatlar (ixtiyoriy)</label>
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

          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="btn-ghost px-4 py-2 text-sm">
              Bekor qilish
            </button>
            <button type="submit" disabled={submitting || uploading} className="btn-primary px-5 py-2">
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saqlanmoqda...</>
              ) : uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Yuklanmoqda...</>
              ) : (
                <><Send className="w-4 h-4" /> {editingId ? 'Saqlash' : "E'lon qilish"}</>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      {updates.length === 0 ? (
        <p className="text-center text-gray-400 py-8">{t('ux.updatesEmpty')}</p>
      ) : (
        <ol className="relative ml-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-8">
          {updates.map((u) => (
            <li key={u.id} className="ml-6">
              <span className="absolute -left-[9px] mt-2 w-4 h-4 rounded-full bg-brand-500 ring-4 ring-white dark:ring-gray-950" />
              <article className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white leading-snug">{u.title}</h3>
                    <time
                      dateTime={u.created_at}
                      className="text-xs text-gray-400"
                      title={new Date(u.created_at).toLocaleString('uz-UZ')}
                    >
                      {timeAgo(u.created_at)}
                    </time>
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                        title="Tahrirlash"
                        aria-label="Tahrirlash"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        disabled={busyId === u.id}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="O'chirish"
                        aria-label="O'chirish"
                      >
                        {busyId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {u.content}
                </p>

                {u.images?.length > 0 && (
                  <div className="mt-4">
                    <ImageGrid images={u.images} />
                  </div>
                )}

                {u.documents?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {u.documents.map((doc, i) => (
                      <a
                        key={i}
                        href={doc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
                      >
                        <FileText className="w-4 h-4" /> Hujjat {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
