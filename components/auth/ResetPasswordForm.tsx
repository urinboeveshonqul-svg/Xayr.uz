'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { RequiredLabel } from '@/components/ui/RequiredLabel';

export function ResetPasswordForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);

  const schema = z
    .object({
      password: z.string().min(6, t('auth.vPasswordMin')),
      confirm_password: z.string(),
    })
    .refine((d) => d.password === d.confirm_password, {
      message: t('auth.vPasswordsMatch'),
      path: ['confirm_password'],
    });
  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // The recovery link must have established a session (via the callback route).
  // If there is no session, the link is invalid/expired — send the user back.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        toast.error(t('auth.resetInvalid'));
        router.replace(`/${locale}/auth/forgot-password`);
      } else {
        setReady(true);
      }
    });
  }, [router, locale, t]);

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: data.password });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(t('auth.passwordUpdated'));
      router.push(`/${locale}`);
      router.refresh();
    } catch {
      toast.error(t('auth.unexpected'));
    }
  };

  if (!ready) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <RequiredLabel>{t('auth.newPassword')}</RequiredLabel>
        <div className="relative">
          <input
            {...register('password')}
            type={show ? 'text' : 'password'}
            className="input pr-10"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
      </div>

      <div>
        <RequiredLabel>{t('auth.confirmPassword')}</RequiredLabel>
        <input
          {...register('confirm_password')}
          type={show ? 'text' : 'password'}
          className="input"
          placeholder="••••••••"
          autoComplete="new-password"
        />
        {errors.confirm_password && (
          <p className="text-red-500 text-xs mt-1">{errors.confirm_password.message}</p>
        )}
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-base">
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('auth.saving')}
          </>
        ) : (
          t('auth.updatePassword')
        )}
      </button>
    </form>
  );
}
