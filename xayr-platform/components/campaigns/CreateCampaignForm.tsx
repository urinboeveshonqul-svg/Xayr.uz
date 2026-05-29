'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Upload, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { slugify } from '@/lib/utils';
import { CATEGORY_CONFIG } from '@/lib/utils';
import type { CampaignCategory } from '@/types';

const schema = z.object({
  title: z.string().min(10, 'Sarlavha kamida 10 ta belgi bo\'lishi kerak').max(100),
  description: z.string().min(30, 'Tavsif kamida 30 ta belgi bo\'lishi kerak').max(300),
  story: z.string().min(50, 'Hikoya kamida 50 ta belgi bo\'lishi kerak').optional().or(z.literal('')),
  category: z.enum(['medical', 'education', 'disaster', 'community', 'environment', 'animal', 'sport', 'other']),
  goal: z.coerce.number().min(100000, 'Maqsad kamida 100,000 so\'m bo\'lishi kerak'),
  deadline: z.string().optional().or(z.literal('')),
  organizer: z.string().max(100).optional().or(z.literal('')),
  location: z.string().max(100).optional().or(z.literal('')),
  is_urgent: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface CreateCampaignFormProps {
  userId: string;
}

export function CreateCampaignForm({ userId }: CreateCampaignFormProps) {
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_urgent: false, category: 'other' },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Rasm hajmi 5MB dan oshmasligi kerak');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      let image_url: string | null = null;

      // Upload image if selected
      if (imageFile) {
        setUploading(true);
        const ext = imageFile.name.split('.').pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('campaign-images')
          .upload(path, imageFile, { upsert: true });

        if (uploadError) {
          toast.error('Rasm yuklashda xatolik: ' + uploadError.message);
          setUploading(false);
          return;
        }

        const { data: urlData } = supabase.storage
          .from('campaign-images')
          .getPublicUrl(path);
        image_url = urlData.publicUrl;
        setUploading(false);
      }

      const slug = slugify(data.title) + '-' + Date.now().toString(36);

      const { error } = await supabase.from('campaigns').insert({
        user_id: userId,
        title: data.title,
        slug,
        description: data.description,
        story: data.story || null,
        category: data.category as CampaignCategory,
        goal: data.goal,
        deadline: data.deadline || null,
        organizer: data.organizer || null,
        location: data.location || null,
        is_urgent: data.is_urgent,
        image_url,
        status: 'pending',
        raised: 0,
        donors_count: 0,
        views: 0,
      });

      if (error) {
        toast.error('Xatolik: ' + error.message);
        return;
      }

      toast.success('Kampaniya yaratildi! Moderatsiyadan o\'tgach faollashadi.');
      router.push('/campaigns');
    } catch (err) {
      toast.error('Kutilmagan xatolik yuz berdi');
      console.error(err);
    }
  };

  const isLoading = isSubmitting || uploading;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Image upload */}
      <div>
        <label className="label">Kampaniya rasmi</label>
        <label className="block cursor-pointer">
          <div className={`relative h-48 rounded-xl border-2 border-dashed transition-colors overflow-hidden ${
            imagePreview
              ? 'border-brand-300 dark:border-brand-700'
              : 'border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-600'
          }`}>
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <Upload className="w-8 h-8" />
                <span className="text-sm">Rasm yuklash (max 5MB)</span>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
        </label>
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
          placeholder="Kampaniya haqida qisqacha (300 belgigacha)"
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
                {CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category.message}</p>}
        </div>
        <div>
          <label className="label">Maqsad (so'm) *</label>
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

      {/* Organizer + Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Tashkilotchi</label>
          <input {...register('organizer')} className="input" placeholder="Ism yoki tashkilot nomi" />
        </div>
        <div>
          <label className="label">Joylashuv</label>
          <input {...register('location')} className="input" placeholder="Shahar, viloyat" />
        </div>
      </div>

      {/* Deadline */}
      <div>
        <label className="label">Muddat (ixtiyoriy)</label>
        <input
          {...register('deadline')}
          type="date"
          className="input"
          min={new Date().toISOString().split('T')[0]}
        />
      </div>

      {/* Urgent */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          {...register('is_urgent')}
          type="checkbox"
          className="w-4 h-4 accent-brand-600"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          🆘 Shoshilinch kampaniya sifatida belgilash
        </span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full py-3 text-base"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {uploading ? 'Rasm yuklanmoqda...' : 'Saqlanmoqda...'}
          </>
        ) : (
          'Kampaniya yaratish'
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Kampaniya moderatsiyadan o'tgach faollashadi (odatda 24 soat ichida)
      </p>
    </form>
  );
}
