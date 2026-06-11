import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep private/authenticated and API surfaces out of the index.
        disallow: [
          '/api/',
          '/*/admin',
          '/*/admin/',
          '/*/profile',
          '/*/profile/',
          '/*/auth/',
          '/*/verify',
          '/*/notifications',
          '/auth/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
