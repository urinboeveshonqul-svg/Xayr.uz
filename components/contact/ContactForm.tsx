'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Send } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Turnstile, type TurnstileHandle } from '@/components/security/Turnstile';

export function ContactForm() {
  const { t } = useI18n();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Schema is built per-render so validation messages follow the active locale.
  const schema = z.object({
    name: z.string().min(2, t('contactPage.form.errName')).max(100),
    email: z.string().email(t('contactPage.form.errEmail')).max(150),
    subject: z.string().max(150).optional().or(z.literal('')),
    message: z.string().min(10, t('contactPage.form.errMessage')).max(2000),
  });

  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    // Routed server-side so the message is Turnstile-gated before it lands in
    // contact_messages. Admins review at /admin/messages.
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          subject: data.subject || null,
          message: data.message,
          turnstileToken: captchaToken,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json?.error || t('contactPage.form.errSend'));
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }
      toast.success(t('contactPage.form.success'));
      reset();
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } catch {
      toast.error(t('contactPage.form.errSend'));
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <label htmlFor="name" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
          {t('contactPage.form.name')}
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder={t('contactPage.form.namePlaceholder')}
          className={inputClass}
          {...register('name')}
        />
        {errors.name && <p className="mt-1.5 text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
          {t('contactPage.form.email')}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={t('contactPage.form.emailPlaceholder')}
          className={inputClass}
          {...register('email')}
        />
        {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="subject" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
          {t('contactPage.form.subject')}
        </label>
        <input
          id="subject"
          type="text"
          placeholder={t('contactPage.form.subjectPlaceholder')}
          className={inputClass}
          {...register('subject')}
        />
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
          {t('contactPage.form.message')}
        </label>
        <textarea
          id="message"
          rows={6}
          placeholder={t('contactPage.form.messagePlaceholder')}
          className={`${inputClass} resize-y`}
          {...register('message')}
        />
        {errors.message && <p className="mt-1.5 text-sm text-red-600">{errors.message.message}</p>}
      </div>

      <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 px-6 py-3 text-white font-bold transition shadow-sm"
      >
        {isSubmitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
        {isSubmitting ? t('contactPage.form.sending') : t('contactPage.form.submit')}
      </button>
    </form>
  );
}
