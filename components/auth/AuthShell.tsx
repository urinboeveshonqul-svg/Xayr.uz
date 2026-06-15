import Link from 'next/link';
import type { ReactNode } from 'react';
import { XayrLogo } from '@/components/branding/XayrLogo';

/**
 * Shared layout for every auth screen: centered card with the official Xayr
 * brand lockup (emerald tile + Crossroads glyph — same mark as the navbar and
 * loader). Replaces the old Heart logo across login/register/forgot/reset/verify
 * so branding is consistent. Server component (pure markup); pages pass already
 * localized strings.
 */
export function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
}: {
  locale: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href={`/${locale}`} className="inline-flex mb-6">
            <XayrLogo size="lg" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-gray-500 dark:text-gray-400 mt-1.5 text-sm">{subtitle}</p>}
        </div>

        <div className="card p-6 sm:p-8">{children}</div>

        {footer && <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">{footer}</div>}
      </div>
    </div>
  );
}
