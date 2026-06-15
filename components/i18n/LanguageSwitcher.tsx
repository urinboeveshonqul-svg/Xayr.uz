'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { locales, localeLabels, localeNames, isLocale, type Locale } from '@/i18n/config';
import { useI18n } from '@/components/i18n/I18nProvider';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Flag } from '@/components/i18n/Flags';

/**
 * Premium language selector: flag + code trigger that opens a dropdown of flags
 * with native language names. The switching logic is unchanged from the old
 * segmented control:
 * - Updates the URL locale segment (soft navigation — no full page reload).
 * - Persists the choice in a cookie (guests + middleware default detection).
 * - Persists to users.preferred_language for signed-in users.
 *
 * Responsive: the code (UZ) is hidden below `sm`, so mobile shows a compact
 * "flag ▼". Dropdown is absolutely positioned (no layout shift), keyboard
 * accessible, and closes on outside-click / Escape.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const switchTo = async (next: Locale) => {
    setOpen(false);
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
        await supabase.from('users').update({ preferred_language: next }).eq('id', user.id);
      }
    } catch {
      // Non-blocking — language still switches via URL + cookie.
    }

    router.push(newPath);
    router.refresh();
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={localeNames[locale]}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border bg-white dark:bg-gray-900 px-2 py-1.5 sm:px-2.5 transition-all',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40',
          open
            ? 'border-green-400 shadow-sm'
            : 'border-gray-200 dark:border-gray-700 hover:border-green-400'
        )}
      >
        <Flag locale={locale} className="w-5 h-3.5 rounded-[3px] flex-shrink-0" />
        <span className="hidden sm:inline text-xs font-bold text-gray-700 dark:text-gray-200">
          {localeLabels[locale]}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-gray-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <ul
          role="listbox"
          aria-label={localeNames[locale]}
          className="absolute right-0 mt-2 w-44 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl p-1.5 z-50 animate-pop origin-top-right"
        >
          {locales.map((l) => {
            const active = l === locale;
            return (
              <li key={l} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => switchTo(l)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40',
                    active
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  <Flag locale={l} className="w-5 h-3.5 rounded-[3px] flex-shrink-0" />
                  <span className="flex-1 text-left">{localeNames[l]}</span>
                  {active && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
