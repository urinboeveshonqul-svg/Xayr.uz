'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * "Continue with Google" — Supabase OAuth (PKCE) sign-in/up in one button.
 *
 * Flow: signInWithOAuth redirects the browser to Google; on consent Google
 * returns to /auth/callback?code=... which exchanges the code for a session
 * (see app/auth/callback/route.ts). The handle_new_user() trigger then creates
 * the public.users profile automatically for first-time Google users — the same
 * path email/password signups use — so nothing here writes user rows directly.
 *
 * No Google credentials live in the app: the client ID/secret are configured
 * only in the Supabase dashboard. This component just kicks off the redirect.
 */
export function GoogleButton() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  // Surface OAuth failures the callback redirected back with (?error=...).
  // access_denied = the user closed/declined Google's consent screen.
  useEffect(() => {
    const err = searchParams.get('error');
    if (!err) return;
    toast.error(err === 'cancelled' ? t('auth.googleCancelled') : t('auth.googleError'));
  }, [searchParams, t]);

  const onClick = async () => {
    setLoading(true);
    try {
      // Land back where the user intended (?next=...), else the localized home.
      const next = searchParams.get('next') || `/${locale}`;
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          // select_account lets users pick/switch Google accounts every time
          // instead of silently reusing the last one.
          queryParams: { prompt: 'select_account' },
        },
      });

      // On success the browser navigates away to Google — no code past this runs.
      if (error) {
        toast.error(t('auth.googleError'));
        setLoading(false);
      }
    } catch {
      toast.error(t('auth.googleError'));
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        // Official Google "G" mark — 4-color, do not recolor (brand guidelines).
        <svg className="w-5 h-5" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
      )}
      {t('auth.continueWithGoogle')}
    </button>
  );
}

/** Localized "or" divider — pairs with GoogleButton above the email/password form. */
export function AuthDivider() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 my-5">
      <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t('auth.orDivider')}
      </span>
      <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}
