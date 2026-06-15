'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = z.object({ email: z.string().email(t('auth.vEmail')) });
  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        // The recovery link lands on the callback, which exchanges the code for
        // a session and then forwards to the reset-password page.
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setSentTo(data.email);
      toast.success(t('auth.resetSent'));
    } catch {
      toast.error(t('auth.unexpected'));
    }
  };

  if (sentTo) {
    return (
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
          <MailCheck className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white">{t('auth.resetSentTitle')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold">{sentTo}</span> — {t('auth.resetSentBody')}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="label">{t('auth.email')} *</label>
        <input
          {...register('email')}
          type="email"
          className="input"
          placeholder={t('auth.emailPlaceholder')}
          autoComplete="email"
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-base">
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('auth.sending')}
          </>
        ) : (
          t('auth.sendReset')
        )}
      </button>
    </form>
  );
}
