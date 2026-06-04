'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const schema = z.object({
  email: z.string().email("To'g'ri email kiriting"),
  password: z.string().min(6, 'Parol kamida 6 ta belgi bo\'lishi kerak'),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      // Auth goes through our server route so it can be rate-limited.
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error || 'Kirishda xatolik yuz berdi');
        return;
      }

      toast.success('Muvaffaqiyatli kirdingiz!');
      const next = searchParams.get('next') ?? '/';
      router.push(next);
      router.refresh();
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            autoComplete="current-password"
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
        <div className="flex justify-end mt-2">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-brand-600 font-semibold hover:underline"
          >
            Parolni unutdingizmi?
          </Link>
        </div>
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
            Kirilmoqda...
          </>
        ) : (
          'Kirish'
        )}
      </button>
    </form>
  );
}
