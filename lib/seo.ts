import type { Metadata } from 'next';
import { locales, defaultLocale, type Locale } from '@/i18n/config';

/**
 * Canonical site origin. Configured via NEXT_PUBLIC_APP_URL (set in Vercel),
 * with a sensible production fallback. Trailing slash stripped so we can safely
 * concatenate paths.
 */
const DEFAULT_SITE_URL = 'https://xayr.uz';

/**
 * Resolve + validate the site origin. A malformed NEXT_PUBLIC_APP_URL must not
 * throw at module load — that would crash `new URL()` below and 500 every page
 * that imports this module. We validate and fall back to the default instead.
 */
function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  try {
    return new URL(raw).origin;
  } catch {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[seo] Invalid NEXT_PUBLIC_APP_URL (${raw}) — falling back to ${DEFAULT_SITE_URL}.`);
    }
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = resolveSiteUrl();

/** Used by `metadataBase` so all relative metadata URLs resolve absolutely. */
export const METADATA_BASE = new URL(SITE_URL);

/** Our short locale codes → BCP-47 tags for <link rel="alternate" hreflang>. */
export const hreflangMap: Record<Locale, string> = {
  uz: 'uz-UZ',
  ru: 'ru-RU',
  en: 'en-US',
};

/** OpenGraph `locale` format (e.g. uz_UZ). */
export const ogLocaleMap: Record<Locale, string> = {
  uz: 'uz_UZ',
  ru: 'ru_RU',
  en: 'en_US',
};

/** Normalize a bare path ("", "/", "campaigns", "/campaigns") → "" or "/campaigns". */
function normalizePath(path = ''): string {
  if (!path || path === '/') return '';
  return path.startsWith('/') ? path : `/${path}`;
}

/** Absolute URL for a locale + bare (locale-less) path. */
export function localeUrl(locale: Locale, path = ''): string {
  return `${SITE_URL}/${locale}${normalizePath(path)}`;
}

/**
 * Canonical + hreflang alternates for a given locale and bare path
 * (WITHOUT the locale prefix, e.g. "/campaigns" or "/campaigns/my-slug").
 * Includes an x-default pointing at the default locale.
 */
export function buildAlternates(locale: Locale, path = ''): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[hreflangMap[l]] = localeUrl(l, path);
  }
  languages['x-default'] = localeUrl(defaultLocale, path);

  return {
    canonical: localeUrl(locale, path),
    languages,
  };
}

interface PageMetadataOptions {
  locale: Locale;
  /** Bare path without the locale prefix, e.g. "/campaigns". Defaults to home. */
  path?: string;
  title?: string;
  description?: string;
  /** Override OG images. Omit on segments that provide an opengraph-image file. */
  images?: NonNullable<Metadata['openGraph']>['images'];
  /** Mark the page as non-indexable (auth, dashboards, etc.). */
  noindex?: boolean;
}

/**
 * Build a complete, SEO-correct Metadata object for a page: canonical URL,
 * hreflang alternates, and a fully-populated OpenGraph/Twitter block. Because
 * Next.js does not deep-merge `openGraph` across segments, this returns every
 * field a page needs in one place.
 */
export function pageMetadata({
  locale,
  path = '',
  title,
  description,
  images,
  noindex,
}: PageMetadataOptions): Metadata {
  const url = localeUrl(locale, path);
  // Brand suffix kept consistent with the rest of the app's page titles.
  const fullTitle = title ? `${title} — Xayr` : undefined;

  return {
    metadataBase: METADATA_BASE,
    title: fullTitle,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: {
      type: 'website',
      siteName: 'Xayr',
      url,
      title: fullTitle,
      description,
      locale: ogLocaleMap[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocaleMap[l]),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      ...(images ? { images } : {}),
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
