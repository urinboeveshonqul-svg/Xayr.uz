'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, Check, X, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { sanitizeUsernameInput, isValidUsername, displayUsername } from '@/lib/username';
import { randomUsernames, smartUsernameSuggestions } from '@/lib/username-generator';
import { Turnstile, isTurnstileEnabled, type TurnstileHandle } from '@/components/security/Turnstile';
import { RequiredLabel } from '@/components/ui/RequiredLabel';

type AvailState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'short';

export function RegisterForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [avail, setAvail] = useState<AvailState>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Fresh random suggestions each page load (client-only → no hydration mismatch).
  const [randomIdeas, setRandomIdeas] = useState<string[]>([]);
  useEffect(() => {
    setRandomIdeas(randomUsernames(6));
  }, []);

  const schema = z
    .object({
      full_name: z.string().min(2, t('auth.vNameMin')).max(100),
      username: z
        .string()
        .min(3, t('auth.vUsername'))
        .max(30)
        .regex(/^[a-z0-9_.]+$/, t('auth.vUsername')),
      email: z.string().email(t('auth.vEmail')),
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
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // Live availability — debounced check against the server.
  const usernameValue = watch('username');
  useEffect(() => {
    const u = (usernameValue || '').toLowerCase().trim();
    setSuggestions([]);
    if (!u) { setAvail('idle'); return; }
    if (u.length < 3) { setAvail('short'); return; }
    if (!isValidUsername(u)) { setAvail('invalid'); return; }
    setAvail('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username-available?u=${encodeURIComponent(u)}`);
        const json = await res.json();
        if (json.available) {
          setAvail('available');
        } else {
          setAvail('taken');
          setSuggestions(smartUsernameSuggestions(u, 5));
        }
      } catch {
        setAvail('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [usernameValue]);

  const onSubmit = async (data: FormData) => {
    if (avail === 'taken' || avail === 'invalid' || avail === 'short') {
      toast.error(t('auth.vUsernameTaken'));
      return;
    }
    // Stop the submission if Turnstile is enabled but hasn't issued a token yet.
    if (isTurnstileEnabled() && !captchaToken) {
      toast.error('Security verification failed. Please try again.');
      return;
    }
    try {
      // Signup goes through our server route so it can be rate-limited.
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.full_name,
          username: data.username.toLowerCase(),
          email: data.email,
          password: data.password,
          turnstileToken: captchaToken,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error || t('auth.signupError'));
        // Tokens are single-use — refresh the widget for the next attempt.
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }

      // Frictionless onboarding: never wall the user behind an email-verify page.
      // They land on the app immediately (auto-logged-in when a session exists);
      // the dismissible banner nudges them to confirm later, and email
      // confirmation is only enforced at campaign creation.
      toast.success(t('auth.signupSuccess'));
      router.push(`/${locale}`);
      router.refresh();
    } catch {
      toast.error(t('auth.unexpected'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <RequiredLabel>{t('auth.fullName')}</RequiredLabel>
        <input
          {...register('full_name')}
          type="text"
          className="input"
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
        />
        {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
      </div>

      {/* Username — live availability, friendly guidance */}
      <div>
        <div className="flex items-center justify-between">
          <RequiredLabel className="mb-0">{t('auth.username')}</RequiredLabel>
          {(usernameValue || '').length > 0 && (
            <span className={`text-xs ${(usernameValue || '').length > 30 ? 'text-red-500' : 'text-gray-400'}`}>
              {(usernameValue || '').length}/30
            </span>
          )}
        </div>
        <div className="relative mt-1.5">
          <input
            {...register('username')}
            onChange={(e) => setValue('username', sanitizeUsernameInput(e.target.value), { shouldValidate: true })}
            type="text"
            className="input pr-10 lowercase"
            placeholder={t('auth.usernamePlaceholderPlain')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {avail === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            {avail === 'available' && <Check className="w-4 h-4 text-green-600" />}
            {avail === 'short' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
            {(avail === 'taken' || avail === 'invalid') && <X className="w-4 h-4 text-red-500" />}
          </span>
        </div>

        {/* Status — icon + text (never color alone) */}
        <div aria-live="polite" className="mt-1.5 text-xs">
          {avail === 'available' && (
            <p className="flex items-center gap-1 text-green-600"><Check className="w-3.5 h-3.5 flex-shrink-0" /> {t('auth.usernameAvailable')}</p>
          )}
          {avail === 'short' && (
            <p className="flex items-center gap-1 text-orange-500"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {t('auth.usernameTooShort')}</p>
          )}
          {avail === 'invalid' && (
            <p className="flex items-center gap-1 text-red-500"><X className="w-3.5 h-3.5 flex-shrink-0" /> {t('auth.usernameInvalidChars')}</p>
          )}
          {avail === 'taken' && (
            <p className="flex items-center gap-1 text-red-500"><X className="w-3.5 h-3.5 flex-shrink-0" /> {t('auth.usernameTaken')}</p>
          )}
          {errors.username && avail === 'idle' && (
            <p className="flex items-center gap-1 text-red-500"><X className="w-3.5 h-3.5 flex-shrink-0" /> {errors.username.message}</p>
          )}
        </div>

        {/* Suggestions when taken */}
        {avail === 'taken' && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setValue('username', s, { shouldValidate: true })}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400 hover:bg-brand-100 hover:-translate-y-0.5 active:scale-95 transition-all"
              >
                @{s}
              </button>
            ))}
          </div>
        )}

        {/* Fresh, random Uzbek-inspired ideas when empty */}
        {avail === 'idle' && !usernameValue && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-gray-400">{t('auth.usernameIdeas')}</p>
              <button
                type="button"
                onClick={() => setRandomIdeas(randomUsernames(6))}
                className="text-gray-400 hover:text-brand-600 transition-colors"
                aria-label={t('auth.usernameShuffle')}
                title={t('auth.usernameShuffle')}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(randomIdeas.length ? randomIdeas : ['mehrnova', 'tongpulse', 'lochincore']).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue('username', s, { shouldValidate: true })}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:-translate-y-0.5 active:scale-95 transition-all"
                >
                  @{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Friendly guidance */}
        <p className="mt-2 text-xs text-gray-400 leading-relaxed">
          {t('auth.usernameHelpTitle')} {t('auth.usernameHelpChars')} · {t('auth.usernameHelpLength')}
        </p>

        {/* Live profile preview */}
        {usernameValue && (
          <div className="mt-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400">{t('auth.usernamePreviewTitle')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{displayUsername(usernameValue)}</p>
              <p className="text-[11px] text-gray-500 truncate">xayr.uz/u/{usernameValue}</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <RequiredLabel>{t('auth.email')}</RequiredLabel>
        <input
          {...register('email')}
          type="email"
          className="input"
          placeholder={t('auth.emailPlaceholder')}
          autoComplete="email"
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <RequiredLabel>{t('auth.password')}</RequiredLabel>
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
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
      </div>

      <div>
        <RequiredLabel>{t('auth.confirmPassword')}</RequiredLabel>
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
            aria-label={showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirm_password && (
          <p className="text-red-500 text-xs mt-1">{errors.confirm_password.message}</p>
        )}
      </div>

      <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} className="flex justify-center" />

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-base">
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('auth.signingUp')}
          </>
        ) : (
          t('auth.signUp')
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">{t('auth.termsNote')}</p>
    </form>
  );
}
