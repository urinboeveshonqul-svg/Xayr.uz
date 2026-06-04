import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { locales, defaultLocale } from '@/i18n/config';
import { localeUrl, hreflangMap } from '@/lib/seo';

// Revalidate the sitemap hourly so new campaigns appear without a redeploy.
export const revalidate = 3600;

/** Public, indexable bare paths (without the locale prefix). */
const STATIC_PATHS = [
  '',            // home
  '/campaigns',
  '/contact',
  '/privacy',
  '/terms',
  '/cookies',
] as const;

/** Build the hreflang alternates map Next.js expects for a bare path. */
function alternatesFor(path: string): { languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[hreflangMap[l]] = localeUrl(l, path);
  }
  languages['x-default'] = localeUrl(defaultLocale, path);
  return { languages };
}

/** Fetch active campaign slugs (+ last update) without needing a request cookie. */
async function getCampaignEntries(): Promise<{ slug: string; updated_at: string }[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return [];

    const supabase = createClient(url, anon);
    const { data, error } = await supabase
      .from('campaigns')
      .select('slug, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(5000);

    if (error || !data) return [];
    return data as { slug: string; updated_at: string }[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages, one entry per locale, each linking to its translations.
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) =>
    locales.map((locale) => ({
      url: localeUrl(locale, path),
      lastModified: now,
      changeFrequency: path === '' || path === '/campaigns' ? 'daily' : 'monthly',
      priority: path === '' ? 1 : path === '/campaigns' ? 0.9 : 0.5,
      alternates: alternatesFor(path),
    }))
  );

  // Campaign detail pages, one entry per locale.
  const campaigns = await getCampaignEntries();
  const campaignEntries: MetadataRoute.Sitemap = campaigns.flatMap((c) => {
    const path = `/campaigns/${c.slug}`;
    const lastModified = c.updated_at ? new Date(c.updated_at) : now;
    return locales.map((locale) => ({
      url: localeUrl(locale, path),
      lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.8,
      alternates: alternatesFor(path),
    }));
  });

  return [...staticEntries, ...campaignEntries];
}
