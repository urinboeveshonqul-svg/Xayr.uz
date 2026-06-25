'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { RequiredLabel } from '@/components/ui/RequiredLabel';

type Phase = 'checking' | 'ready' | 'invalid';

export function ResetPasswordForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>('checking');

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

  // A valid recovery link establishes a temporary session via /auth/callback.
  // Confirm it exists; if not, the link is expired/invalid/already-used → show a
  // friendly error with a way to request a new email (never a blank page or the
  // homepage). Also listen for a slightly-late recovery/sign-in event.
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setPhase(data.user ? 'ready' : 'invalid');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user) setPhase('ready');
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) {
        toast.error(error.message);
        return;
      }

      // Invalidate the temporary recovery session, then send to login.
      await supabase.auth.signOut();
      toast.success(t('auth.passwordUpdated'));
      router.push(`/${locale}/auth/login`);
      router.refresh();
    } catch {
      toast.error(t('auth.unexpected'));
    }
  };

  if (phase === 'checking') {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  // Expired / invalid / already-used recovery link.
  if (phase === 'invalid') {
    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('auth.resetInvalid')}</p>
        <Link
          href={`/${locale}/auth/forgot-password`}
          className="btn-primary w-full py-3 text-base inline-flex justify-center"
        >
          {t('auth.sendReset')}
        </Link>
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
