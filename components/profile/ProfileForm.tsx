'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

const schema = z.object({
  full_name: z.string().min(2, 'Ism kamida 2 ta belgi bo\'lishi kerak').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  bio: z.string().max(300).optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

interface ProfileFormProps {
  profile: Profile;
  email: string;
}

export function ProfileForm({ profile, email }: ProfileFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      bio: profile.bio ?? '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('users')
        .update({
          full_name: data.full_name,
          phone: data.phone || null,
          bio: data.bio || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) {
        toast.error('Xatolik: ' + error.message);
        return;
      }

      toast.success('Profil yangilandi!');
      router.refresh();
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Email (read-only) */}
      <div>
        <label className="label flex items-center gap-1.5">
          Email
          {profile.email_confirmed && (
            <CheckCircle className="w-3.5 h-3.5 text-green-600" aria-label="Verified" />
          )}
        </label>
        <input
          type="email"
          value={email}
          disabled
          className="input opacity-60 cursor-not-allowed"
        />
        <p className="text-xs text-gray-400 mt-1">Email manzilini o'zgartirib bo'lmaydi.</p>
      </div>

      {/* Full name */}
      <div>
        <label className="label">To'liq ism *</label>
        <input {...register('full_name')} className="input" placeholder="Ism Familiya" />
        {errors.full_name && (
          <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label className="label">Telefon</label>
        <input {...register('phone')} className="input" placeholder="+998 90 123 45 67" />
        {errors.phone && (
          <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
        )}
      </div>

      {/* Bio */}
      <div>
        <label className="label">Bio</label>
        <textarea
          {...register('bio')}
          rows={3}
          className="input resize-none"
          placeholder="O'zingiz haqingizda qisqacha..."
        />
        {errors.bio && (
          <p className="text-red-500 text-xs mt-1">{errors.bio.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary w-full py-3 text-base"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Saqlanmoqda...
          </>
        ) : (
          "O'zgarishlarni saqlash"
        )}
      </button>
    </form>
  );
}
