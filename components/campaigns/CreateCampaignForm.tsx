'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Upload, Loader2, ImagePlus, X, Siren } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { VerifyEmailModal } from '@/components/auth/VerifyEmailModal';
import { slugify, CATEGORY_CONFIG } from '@/lib/utils';
import type { CampaignCategory } from '@/types';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_GALLERY = 5;

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

interface CreateCampaignFormProps {
  userId: string;
  categories: { id: string; slug: CampaignCategory }[];
  /** Email confirmation — the gate for creating a campaign. */
  emailVerified: boolean;
}

export function CreateCampaignForm({ userId, categories, emailVerified }: CreateCampaignFormProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  // Email-verification gate. Open the modal immediately for unverified users so
  // verification happens here (not via a redirect); on success the form unlocks
  // and they continue without clicking again.
  const [verified, setVerified] = useState(emailVerified);
  const [showVerify, setShowVerify] = useState(!emailVerified);

  // Cover image (required)
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  // Additional images (optional gallery)
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const blobUrls = useRef<string[]>([]);

  // Revoke every created object URL on unmount to avoid memory leaks.
  useEffect(() => {
    return () => blobUrls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_urgent: false, category: 'other' },
  });

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error('Rasm hajmi 5MB dan oshmasligi kerak');
      return;
    }
    const url = URL.createObjectURL(file);
    blobUrls.current.push(url);
    setCoverFile(file);
    setCoverPreview(url);
    setCoverError(null);
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file later
    if (!files.length) return;

    const room = MAX_GALLERY - galleryFiles.length;
    if (room <= 0) {
      toast.error(`Ko'pi bilan ${MAX_GALLERY} ta qo'shimcha rasm`);
      return;
    }

    const accepted: File[] = [];
    const previews: string[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_IMAGE_SIZE) {
        toast.error(`${f.name} — 5MB dan katta`);
        continue;
      }
      const url = URL.createObjectURL(f);
      blobUrls.current.push(url);
      accepted.push(f);
      previews.push(url);
    }
    setGalleryFiles((prev) => [...prev, ...accepted]);
    setGalleryPreviews((prev) => [...prev, ...previews]);
  };

  const removeGalleryImage = (index: number) => {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadImage = async (
    supabase: ReturnType<typeof createClient>,
    file: File,
    tag: string
  ): Promise<string> => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}-${tag}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('campaign-images').upload(path, file);
    if (error) throw error;
    return supabase.storage.from('campaign-images').getPublicUrl(path).data.publicUrl;
  };

  const onSubmit = async (data: FormData) => {
    // Email confirmation is mandatory to create a campaign — no bypass.
    if (!verified) {
      setShowVerify(true);
      return;
    }
    if (!coverFile) {
      setCoverError('Muqova rasmi majburiy');
      return;
    }

    const supabase = createClient();
    setUploading(true);
    try {
      // 1) Cover image → image_url
      const image_url = await uploadImage(supabase, coverFile, 'cover');

      // 2) Additional images → images[]
      const images: string[] = [];
      for (const file of galleryFiles) {
        images.push(await uploadImage(supabase, file, 'gallery'));
      }

      // 3) Insert campaign row
      const slug = slugify(data.title) + '-' + Date.now().toString(36);
      const category_id = categories.find((c) => c.slug === data.category)?.id ?? null;

      const { error } = await supabase.from('campaigns').insert({
        user_id: userId,
        title: data.title,
        slug,
        description: data.description,
        story: data.story || null,
        category_id,
        goal_amount: data.goal,
        deadline: data.deadline || null,
        location: data.location || null,
        is_urgent: data.is_urgent,
        image_url,
        images,
        // Email-confirmed authors publish to 'pending'; the DB trigger
        // (enforce_campaign_publish) re-checks email confirmation server-side.
        status: 'pending',
      });

      if (error) {
        toast.error('Xatolik: ' + error.message);
        return;
      }

      toast.success('Kampaniya yaratildi! Moderatsiyadan o\'tgach faollashadi.');
      router.push(`/${locale}/campaigns`);
      router.refresh();
    } catch (err) {
      toast.error('Rasm yuklashda yoki saqlashda xatolik');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const isLoading = isSubmitting || uploading;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Email-verification gate notice */}
      {!verified && (
        <div className="card p-4 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-900/40">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">{t('verify.gateBody')}</p>
          <button
            type="button"
            onClick={() => setShowVerify(true)}
            className="btn-primary mt-3 py-2.5 text-sm"
          >
            {t('verify.gateVerify')}
          </button>
        </div>
      )}

      {showVerify && (
        <VerifyEmailModal
          onClose={() => setShowVerify(false)}
          onVerified={() => { setVerified(true); setShowVerify(false); }}
        />
      )}

      {/* Cover image (required) */}
      <div>
        <label className="label">Muqova rasmi *</label>
        <label className="block cursor-pointer">
          <div className={`relative h-48 sm:h-56 rounded-xl border-2 border-dashed transition-colors overflow-hidden ${
            coverError
              ? 'border-red-400'
              : coverPreview
              ? 'border-brand-300 dark:border-brand-700'
              : 'border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-600'
          }`}>
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="Muqova" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <Upload className="w-8 h-8" />
                <span className="text-sm">Muqova rasmini yuklang (max 5MB)</span>
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
          Qo&apos;shimcha rasmlar (ixtiyoriy, {galleryFiles.length}/{MAX_GALLERY})
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {galleryPreviews.map((src, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Rasm ${i + 1}`} className="w-full h-full object-cover" />
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

          {galleryFiles.length < MAX_GALLERY && (
            <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-600 flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-400 transition-colors">
              <ImagePlus className="w-6 h-6" />
              <span className="text-[11px] font-medium">Qo&apos;shish</span>
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
        <label className="label">Sarlavha *</label>
        <input {...register('title')} className="input" placeholder="Kampaniya sarlavhasi" />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="label">Qisqa tavsif *</label>
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
          <label className="label">Kategoriya *</label>
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
          <label className="label">Maqsad (so&apos;m) *</label>
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

      {/* Submit */}
      <button type="submit" disabled={isLoading} className="btn-primary w-full py-3 text-base">
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {uploading ? 'Rasmlar yuklanmoqda...' : 'Saqlanmoqda...'}
          </>
        ) : (
          'Kampaniya yaratish'
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Kampaniya moderatsiyadan o&apos;tgach faollashadi (odatda 24 soat ichida)
      </p>
    </form>
  );
}
