'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, Check, X } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

type AvailState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function RegisterForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [avail, setAvail] = useState<AvailState>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);

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
    if (!/^[a-z0-9_.]{3,30}$/.test(u)) { setAvail('invalid'); return; }
    setAvail('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username-available?u=${encodeURIComponent(u)}`);
        const json = await res.json();
        if (json.available) {
          setAvail('available');
        } else {
          setAvail('taken');
          const year = new Date().getFullYear();
          setSuggestions([`${u}1`, `${u}_uz`, `${u}${year}`]);
        }
      } catch {
        setAvail('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [usernameValue]);

  const onSubmit = async (data: FormData) => {
    if (avail === 'taken' || avail === 'invalid') {
      toast.error(t('auth.vUsernameTaken'));
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
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error || t('auth.signupError'));
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
        <label className="label">{t('auth.fullName')} *</label>
        <input
          {...register('full_name')}
          type="text"
          className="input"
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
        />
        {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
      </div>

      {/* Username with live availability */}
      <div>
        <label className="label">{t('auth.username')} *</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">@</span>
          <input
            {...register('username')}
            type="text"
            className="input pl-8 pr-10 lowercase"
            placeholder={t('auth.usernamePlaceholder')}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {avail === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            {avail === 'available' && <Check className="w-4 h-4 text-green-600" />}
            {(avail === 'taken' || avail === 'invalid') && <X className="w-4 h-4 text-red-500" />}
          </span>
        </div>
        {avail === 'available' && <p className="text-green-600 text-xs mt-1">✓ {t('auth.usernameAvailable')}</p>}
        {avail === 'invalid' && <p className="text-red-500 text-xs mt-1">{t('auth.vUsername')}</p>}
        {avail === 'taken' && (
          <div className="mt-1.5">
            <p className="text-red-500 text-xs">{t('auth.usernameTaken')}</p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setValue('username', s, { shouldValidate: true })}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400 hover:bg-brand-100 transition-colors"
                  >
                    @{s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {errors.username && avail !== 'invalid' && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
      </div>

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

      <div>
        <label className="label">{t('auth.password')} *</label>
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
        <label className="label">{t('auth.confirmPassword')} *</label>
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
