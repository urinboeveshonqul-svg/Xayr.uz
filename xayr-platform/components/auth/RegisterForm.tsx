'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const schema = z
  .object({
    full_name: z.string().min(2, 'Ism kamida 2 ta belgi bo\'lishi kerak').max(100),
    email: z.string().email("To'g'ri email kiriting"),
    password: z.string().min(6, 'Parol kamida 6 ta belgi bo\'lishi kerak'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Parollar mos kelmadi',
    path: ['confirm_password'],
  });

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          // handle_new_user trigger reads this to populate profiles.full_name
          data: { full_name: data.full_name },
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('Bu email allaqachon ro\'yxatdan o\'tgan');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success('Ro\'yxatdan muvaffaqiyatli o\'tdingiz!');
      router.push('/');
      router.refresh();
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Full name */}
      <div>
        <label className="label">To'liq ism *</label>
        <input
          {...register('full_name')}
          type="text"
          className="input"
          placeholder="Ism Familiya"
          autoComplete="name"
        />
        {errors.full_name && (
          <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label className="label">Email *</label>
        <input
          {...register('email')}
          type="email"
          className="input"
          placeholder="sizning@email.com"
          autoComplete="email"
        />
        {errors.email && (
          <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="label">Parol *</label>
        <div className="relative">
          <input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            className="input pr-10"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko\'rsatish'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
        )}
      </div>

      {/* Confirm password */}
      <div>
        <label className="label">Parolni tasdiqlash *</label>
        <div className="relative">
          <input
            {...register('confirm_password')}
            type={showConfirm ? 'text' : 'password'}
            className="input pr-10"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label={showConfirm ? 'Parolni yashirish' : 'Parolni ko\'rsatish'}
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirm_password && (
          <p className="text-red-500 text-xs mt-1">{errors.confirm_password.message}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary w-full py-3 text-base"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Ro'yxatdan o'tilmoqda...
          </>
        ) : (
          "Ro'yxatdan o'tish"
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Ro'yxatdan o'tish orqali siz platformamiz shartlarini qabul qilasiz.
      </p>
    </form>
  );
}
