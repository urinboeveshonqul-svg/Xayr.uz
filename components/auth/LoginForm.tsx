'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, Clock } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Turnstile, isTurnstileEnabled, type TurnstileHandle } from '@/components/security/Turnstile';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { safeNextPath } from '@/lib/security/redirect';

export function LoginForm() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  // Set by middleware ONLY when the request carried auth cookies that no longer
  // validate — i.e. a real session ended. Never shown to someone who simply
  // wasn't signed in.
  const sessionExpired = searchParams.get('reason') === 'expired';
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const schema = z.object({
    identifier: z.string().min(1, t('auth.vIdentifier')),
    password: z.string().min(6, t('auth.vPasswordMin')),
  });
  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    // Stop the submission if Turnstile is enabled but hasn't issued a token yet
    // (common on mobile while the challenge resolves). Show the error, never hang.
    if (isTurnstileEnabled() && !captchaToken) {
      toast.error('Security verification failed. Please try again.');
      return;
    }
    try {
      // Auth goes through our server route so it can be rate-limited.
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: data.identifier,
          password: data.password,
          turnstileToken: captchaToken,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error || t('auth.loginError'));
        // Tokens are single-use — refresh the widget for the next attempt.
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }

      toast.success(t('auth.loginSuccess'));
      // `next` is a bare (locale-less) path from middleware; validate it (reject
      // open-redirect targets) then prefix the locale so the redirect lands
      // directly without an extra middleware hop.
      const next = safeNextPath(searchParams.get('next'));
      const dest = next === '/' ? `/${locale}` : `/${locale}${next}`;

      // Full document navigation — NOT router.push()/router.refresh().
      //
      // The session cookies were just set by the /api/auth/login response, but a
      // client-side push can serve the destination from Next's client Router
      // Cache, which still holds the SIGNED-OUT render (static/ISR routes like
      // the homepage are cached for staleTimes.static = 300s). The server is
      // never contacted, middleware never runs, and the user appears logged out
      // until they log in a second time — at which point the AUTH_ONLY middleware
      // redirect finally forces a real server round-trip.
      //
      // router.refresh() cannot fix that ordering: it returns void, so it can be
      // neither awaited nor sequenced against push(). A document navigation is
      // the deterministic option — it always sends the new cookies, always runs
      // middleware, and cannot read the per-document Router Cache. This is the
      // same approach logout already uses (components/layout/Navbar.tsx).
      window.location.assign(dest);
    } catch {
      toast.error(t('auth.unexpected'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {sessionExpired && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3"
        >
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-amber-900 dark:text-amber-300">{t('auth.sessionExpired')}</p>
        </div>
      )}

      <div>
        <RequiredLabel>{t('auth.emailOrUsername')}</RequiredLabel>
        <input
          {...register('identifier')}
          type="text"
          className="input"
          placeholder={t('auth.emailOrUsernamePlaceholder')}
          autoComplete="username"
        />
        {errors.identifier && <p className="text-red-500 text-xs mt-1">{errors.identifier.message}</p>}
      </div>

      <div>
        <RequiredLabel>{t('auth.password')}</RequiredLabel>
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
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        <div className="flex justify-end mt-2">
          <Link
            href={`/${locale}/auth/forgot-password`}
            className="text-sm text-brand-600 font-semibold hover:underline"
          >
            {t('auth.forgotPassword')}
          </Link>
        </div>
      </div>

      <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} className="flex justify-center" />

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-base">
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('auth.signingIn')}
          </>
        ) : (
          t('auth.signIn')
        )}
      </button>
    </form>
  );
}
