'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Upload, Loader2, ImagePlus, X, Siren, Save, Check, CloudOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { CATEGORY_CONFIG } from '@/lib/utils';
import type { CampaignCategory, CampaignDraft } from '@/types';
import { Turnstile, isTurnstileEnabled, type TurnstileHandle } from '@/components/security/Turnstile';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { fileExtension, imageRejectReason, uploadErrorKey, uploadToStorage } from '@/lib/image-upload';
import { draftColumns, hasDraftContent, type DraftFormValues } from '@/lib/drafts';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_GALLERY = 5;
const AUTOSAVE_DEBOUNCE_MS = 1200;

const schema = z.object({
  title: z.string().min(10, 'Sarlavha kamida 10 ta belgi bo\'lishi kerak').max(120),
  description: z.string().min(30, 'Tavsif kamida 30 ta belgi bo\'lishi kerak').max(500),
  story: z.string().min(50, 'Hikoya kamida 50 ta belgi bo\'lishi kerak').optional().or(z.literal('')),
  category: z.enum(['medical', 'education', 'disaster', 'community', 'environment', 'animal', 'sport', 'other']),
  goal: z.coerce.number().min(100000, 'Maqsad kamida 100,000 so\'m bo\'lishi kerak'),
  location: z.string().max(120).optional().or(z.literal('')),
  deadline: z.string().optional().or(z.literal('')),
  is_urgent: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

type Img = { url: string; preview: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface CreateCampaignFormProps {
  userId: string;
  categories: { id: string; slug: CampaignCategory }[];
  /** When resuming, prefill from this draft and keep auto-saving into it. */
  initialDraft?: CampaignDraft | null;
}

// A draft write can fail simply because the migration hasn't been applied yet.
// Detect that specific case so we can silently disable auto-save (and never let
// it interfere with the create flow) rather than nagging the user.
function isMissingDraftsTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || (msg.includes('campaign_drafts') && msg.includes('exist')) || msg.includes('schema cache');
}

export function CreateCampaignForm({ userId, categories, initialDraft = null }: CreateCampaignFormProps) {
  const router = useRouter();
  const { t, locale } = useI18n();

  // Cover image (required). `url` is the uploaded campaign-images URL; `preview`
  // is what we render (a local blob for a fresh pick, or the URL for a draft).
  const [cover, setCoverState] = useState<Img | null>(
    initialDraft?.image_url ? { url: initialDraft.image_url, preview: initialDraft.image_url } : null
  );
  const coverRef = useRef<Img | null>(cover);
  const setCover = (c: Img | null) => { coverRef.current = c; setCoverState(c); };
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  // Additional images (optional gallery).
  const [gallery, setGalleryState] = useState<Img[]>(
    (initialDraft?.images ?? []).map((u) => ({ url: u, preview: u }))
  );
  const galleryRef = useRef<Img[]>(gallery);
  const setGallery = (updater: (prev: Img[]) => Img[]) =>
    setGalleryState((prev) => { const next = updater(prev); galleryRef.current = next; return next; });
  const [galleryUploading, setGalleryUploading] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const blobUrls = useRef<string[]>([]);

  // Draft auto-save state.
  const draftIdRef = useRef<string | null>(initialDraft?.id ?? null);
  const draftsDisabledRef = useRef(false);
  const [draftsDisabled, setDraftsDisabled] = useState(false);
  const savingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>(initialDraft ? 'saved' : 'idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    initialDraft ? Date.parse(initialDraft.updated_at) : null
  );

  // Revoke every created object URL on unmount, and cancel any pending save.
  useEffect(() => {
    const urls = blobUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      is_urgent: initialDraft?.is_urgent ?? false,
      category: (initialDraft?.category as CampaignCategory) ?? 'other',
      title: initialDraft?.title ?? '',
      description: initialDraft?.description ?? '',
      story: initialDraft?.story ?? '',
      goal: (initialDraft?.goal_amount ?? undefined) as number | undefined,
      location: initialDraft?.location ?? '',
      deadline: initialDraft?.deadline ?? '',
    },
  });

  // Snapshot the current form + uploaded image URLs as draft field values.
  const snapshot = useCallback((): DraftFormValues => {
    const v = getValues();
    return {
      title: v.title,
      description: v.description,
      story: v.story,
      category: v.category,
      goal: v.goal ? Number(v.goal) : null,
      location: v.location,
      deadline: v.deadline,
      is_urgent: v.is_urgent,
      image_url: coverRef.current?.url || null,
      images: galleryRef.current.map((g) => g.url).filter(Boolean),
    };
  }, [getValues]);

  // Persist the draft (create on first save, update thereafter). `manual` drives
  // toasts for the explicit "Save as Draft" action.
  const saveDraft = useCallback(async (manual: boolean) => {
    if (draftsDisabledRef.current) { if (manual) toast.error(t('draft.unavailable')); return; }
    const values = snapshot();
    if (!hasDraftContent(values)) { if (manual) toast.error(t('draft.emptyNothing')); return; }
    if (savingRef.current) return; // a save is already in flight

    savingRef.current = true;
    setSaveState('saving');
    try {
      const supabase = createClient();
      const cols = draftColumns(values);
      if (draftIdRef.current) {
        const { error } = await supabase.from('campaign_drafts').update(cols).eq('id', draftIdRef.current);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('campaign_drafts')
          .insert({ user_id: userId, ...cols })
          .select('id')
          .single();
        if (error) throw error;
        draftIdRef.current = data.id;
      }
      setSaveState('saved');
      setLastSavedAt(Date.now());
      if (manual) toast.success(t('draft.savedToast'));
    } catch (err) {
      if (isMissingDraftsTable(err)) {
        draftsDisabledRef.current = true;
        setDraftsDisabled(true);
        setSaveState('idle');
        if (manual) toast.error(t('draft.unavailable'));
        return;
      }
      setSaveState('error');
      if (manual) toast.error(t('draft.saveError'));
    } finally {
      savingRef.current = false;
    }
  }, [snapshot, t, userId]);

  // Debounced trigger used by every edit (fields + images).
  const scheduleSave = useCallback(() => {
    if (draftsDisabledRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveDraft(false); }, AUTOSAVE_DEBOUNCE_MS);
  }, [saveDraft]);

  // Auto-save on any field change.
  useEffect(() => {
    const sub = watch(() => scheduleSave());
    return () => sub.unsubscribe();
  }, [watch, scheduleSave]);

  const uploadImage = async (file: File, tag: string): Promise<string> => {
    const supabase = createClient();
    const path = `${userId}/${Date.now()}-${tag}-${Math.random().toString(36).slice(2, 8)}.${fileExtension(file)}`;
    await uploadToStorage(supabase, 'campaign-images', path, file);
    return supabase.storage.from('campaign-images').getPublicUrl(path).data.publicUrl;
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reason = imageRejectReason(file, MAX_IMAGE_SIZE);
    if (reason === 'too_large') { toast.error(t('toasts.imageSize5mb')); return; }
    if (reason === 'unsupported_format') { toast.error(t('toasts.imageUnsupportedFormat')); return; }

    const preview = URL.createObjectURL(file);
    blobUrls.current.push(preview);
    setCover({ url: '', preview }); // show immediately; url filled after upload
    setCoverError(null);
    setCoverUploading(true);
    try {
      const url = await uploadImage(file, 'cover');
      setCover({ url, preview });
      scheduleSave();
    } catch (err) {
      toast.error(t(uploadErrorKey(err)));
      setCover(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    const room = MAX_GALLERY - galleryRef.current.length;
    if (room <= 0) { toast.error(t('draft.galleryMax').replace('{n}', String(MAX_GALLERY))); return; }

    const accepted: File[] = [];
    for (const f of files.slice(0, room)) {
      const reason = imageRejectReason(f, MAX_IMAGE_SIZE);
      if (reason === 'too_large') { toast.error(`${f.name} — 5MB dan katta`); continue; }
      if (reason === 'unsupported_format') { toast.error(`${f.name} — ${t('toasts.imageUnsupportedFormat')}`); continue; }
      accepted.push(f);
    }
    if (!accepted.length) return;

    setGalleryUploading((n) => n + accepted.length);
    for (const f of accepted) {
      const preview = URL.createObjectURL(f);
      blobUrls.current.push(preview);
      try {
        const url = await uploadImage(f, 'gallery');
        setGallery((prev) => [...prev, { url, preview }]);
        scheduleSave();
      } catch (err) {
        toast.error(t(uploadErrorKey(err)));
      } finally {
        setGalleryUploading((n) => n - 1);
      }
    }
  };

  const removeGalleryImage = (index: number) => {
    setGallery((prev) => prev.filter((_, i) => i !== index));
    scheduleSave();
  };

  const onSubmit = async (data: FormData) => {
    if (!cover?.url) {
      setCoverError(t('draft.coverRequired'));
      return;
    }
    // Stop the submission if Turnstile is enabled but hasn't issued a token yet.
    if (isTurnstileEnabled() && !captchaToken) {
      toast.error(t('toasts.turnstile'));
      return;
    }

    setSubmitting(true);
    try {
      // Images are already uploaded (on select) — submit references their URLs.
      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          story: data.story || null,
          category: data.category,
          goal: data.goal,
          location: data.location || null,
          deadline: data.deadline || null,
          is_urgent: data.is_urgent,
          image_url: cover.url,
          images: gallery.map((g) => g.url),
          turnstileToken: captchaToken,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ? `${t('toasts.errorLabel')}: ${json.error}` : t('toasts.generic'));
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }

      // The draft became a real (pending) campaign — remove the scratch row.
      if (draftIdRef.current) {
        try { await createClient().from('campaign_drafts').delete().eq('id', draftIdRef.current); } catch { /* draft cleanup is best-effort */ }
      }

      toast.success(t('toasts.campaignCreated'));
      router.push(`/${locale}/profile/campaigns`);
      router.refresh();
    } catch {
      toast.error(t('toasts.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const uploadingImages = coverUploading || galleryUploading > 0;
  const isLoading = isSubmitting || submitting;

  const savedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Cover image (required) */}
      <div>
        <RequiredLabel>{t('draft.coverLabel')}</RequiredLabel>
        <label className="block cursor-pointer">
          <div className={`relative h-48 sm:h-56 rounded-xl border-2 border-dashed transition-colors overflow-hidden ${
            coverError
              ? 'border-red-400'
              : cover
              ? 'border-brand-300 dark:border-brand-700'
              : 'border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-600'
          }`}>
            {cover ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.preview} alt="Muqova" className="w-full h-full object-cover" />
                {coverUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <Upload className="w-8 h-8" />
                <span className="text-sm">{t('draft.coverHint')}</span>
              </div>
            )}
          </div>
          <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
        </label>
        {coverError && <p className="text-red-500 text-xs mt-1">{coverError}</p>}
      </div>

      {/* Additional images (optional) */}
      <div>
        <label className="label">
          {t('draft.galleryLabel')} ({gallery.length}/{MAX_GALLERY})
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {gallery.map((img, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt={`Rasm ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeGalleryImage(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                aria-label="O'chirish"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {gallery.length + galleryUploading < MAX_GALLERY && (
            <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-600 flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-400 transition-colors">
              {galleryUploading > 0 ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
              <span className="text-[11px] font-medium">{t('draft.galleryAdd')}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <RequiredLabel>Sarlavha</RequiredLabel>
        <input {...register('title')} className="input" placeholder="Kampaniya sarlavhasi" />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
      </div>

      {/* Description */}
      <div>
        <RequiredLabel>Qisqa tavsif</RequiredLabel>
        <textarea
          {...register('description')}
          rows={3}
          className="input resize-none"
          placeholder="Kampaniya haqida qisqacha (500 belgigacha)"
        />
        {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
      </div>

      {/* Story */}
      <div>
        <label className="label">Batafsil hikoya</label>
        <textarea
          {...register('story')}
          rows={6}
          className="input resize-none"
          placeholder="Kampaniya haqida batafsil yozing..."
        />
        {errors.story && <p className="text-red-500 text-xs mt-1">{errors.story.message}</p>}
      </div>

      {/* Category + Goal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <RequiredLabel>Kategoriya</RequiredLabel>
          <select {...register('category')} className="input">
            {(Object.keys(CATEGORY_CONFIG) as CampaignCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_CONFIG[cat].label}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category.message}</p>}
        </div>
        <div>
          <RequiredLabel>Maqsad (so&apos;m)</RequiredLabel>
          <input
            {...register('goal')}
            type="number"
            className="input"
            placeholder="5000000"
            min={100000}
          />
          {errors.goal && <p className="text-red-500 text-xs mt-1">{errors.goal.message}</p>}
        </div>
      </div>

      {/* Location + End date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Joylashuv</label>
          <input {...register('location')} className="input" placeholder="Shahar, viloyat" />
          {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>}
        </div>
        <div>
          <label className="label">Tugash sanasi</label>
          <input
            {...register('deadline')}
            type="date"
            className="input"
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      {/* Urgent */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input {...register('is_urgent')} type="checkbox" className="w-4 h-4 accent-brand-600" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <Siren className="w-4 h-4 text-red-500" /> Shoshilinch kampaniya sifatida belgilash
        </span>
      </label>

      {/* Bot/abuse gate */}
      <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} />

      {/* Save status + manual draft save */}
      {!draftsDisabled && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400 flex items-center gap-1.5" aria-live="polite">
            {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('draft.saving')}</>}
            {saveState === 'saved' && <><Check className="w-3.5 h-3.5 text-green-600" /> {savedTime ? t('draft.lastSaved').replace('{time}', savedTime) : t('draft.saved')}</>}
            {saveState === 'error' && <><CloudOff className="w-3.5 h-3.5 text-red-500" /> {t('draft.saveError')}</>}
          </span>
          <button
            type="button"
            onClick={() => saveDraft(true)}
            disabled={saveState === 'saving' || uploadingImages}
            className="btn-ghost px-4 py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {t('draft.saveAsDraft')}
          </button>
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={isLoading || uploadingImages} className="btn-primary w-full py-3 text-base">
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('draft.submitting')}
          </>
        ) : uploadingImages ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('draft.uploadingImages')}
          </>
        ) : (
          t('draft.submitForReview')
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Kampaniya moderatsiyadan o&apos;tgach faollashadi (odatda 24 soat ichida)
      </p>
    </form>
  );
}
