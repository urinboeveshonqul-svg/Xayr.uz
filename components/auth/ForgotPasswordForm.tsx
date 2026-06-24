'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MailCheck } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Turnstile, isTurnstileEnabled, type TurnstileHandle } from '@/components/security/Turnstile';

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const schema = z.object({ email: z.string().email(t('auth.vEmail')) });
  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    if (isTurnstileEnabled() && !captchaToken) {
      toast.error('Security verification failed. Please try again.');
      return;
    }
    try {
      // Routed server-side so the request is Turnstile-gated + rate-limited.
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, turnstileToken: captchaToken }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json?.error || t('auth.unexpected'));
        turnstileRef.current?.reset();
        setCaptchaToken(null);
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

      <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} className="flex justify-center" />

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
