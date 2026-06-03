'use client';

import { usePathname, useRouter } from 'next/navigation';
import { locales, localeLabels, isLocale, type Locale } from '@/i18n/config';
import { useI18n } from '@/components/i18n/I18nProvider';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/**
 * UZ | RU | EN switcher.
 * - Updates the URL locale segment (soft navigation — no full page reload).
 * - Persists the choice in a cookie (guests + middleware default detection).
 * - Persists to profiles.preferred_language for signed-in users.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useI18n();

  const switchTo = async (next: Locale) => {
    if (next === locale) return;

    const segments = pathname.split('/');
    if (isLocale(segments[1])) {
      segments[1] = next;
    } else {
      segments.splice(1, 0, next);
    }
    const newPath = segments.join('/') || `/${next}`;

    // Persist for guests + middleware.
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;

    // Persist for signed-in users.
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('users')
          .update({ preferred_language: next })
          .eq('id', user.id);
      }
    } catch {
      // Non-blocking — language still switches via URL + cookie.
    }

    router.push(newPath);
    router.refresh();
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white p-0.5',
        className
      )}
      role="group"
      aria-label="Language"
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-current={l === locale}
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
            l === locale
              ? 'bg-green-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-green-600 hover:bg-green-50'
          )}
        >
          {localeLabels[l]}
        </button>
      ))}
    </div>
  );
}
