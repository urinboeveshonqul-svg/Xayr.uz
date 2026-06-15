import { SITE_URL, localeUrl } from '@/lib/seo';
import type { Locale } from '@/i18n/config';
import type { Campaign } from '@/types';

/**
 * Per-campaign structured data (JSON-LD) for richer Google indexing:
 *  - BreadcrumbList  → breadcrumb rich result (Home › Campaigns › Title)
 *  - WebPage         → canonical page entity with image + language
 *  - DonateAction    → marks the page as a fundraiser with a donate action,
 *                      recipient = the creator (Person) or Xayr (Organization)
 *
 * Returned as a plain object; the page serializes it into a
 * <script type="application/ld+json">. All URLs are absolute (Google requires it).
 */
export function buildCampaignJsonLd(campaign: Campaign, locale: Locale) {
  const url = localeUrl(locale, `/campaigns/${campaign.slug}`);
  const ogLocaleTag = locale;
  const image = campaign.image_url || `${url}/opengraph-image`;
  const creatorName = campaign.profiles?.full_name ?? null;

  const recipient = creatorName
    ? { '@type': 'Person', name: creatorName }
    : { '@type': 'Organization', name: 'Xayr', url: SITE_URL };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Xayr', item: localeUrl(locale, '') },
          { '@type': 'ListItem', position: 2, name: 'Kampaniyalar', item: localeUrl(locale, '/campaigns') },
          { '@type': 'ListItem', position: 3, name: campaign.title, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: campaign.title,
        description: campaign.description,
        inLanguage: ogLocaleTag,
        primaryImageOfPage: image,
        isPartOf: { '@type': 'WebSite', name: 'Xayr', url: SITE_URL },
        potentialAction: {
          '@type': 'DonateAction',
          name: 'Xayriya qilish',
          target: url,
          recipient,
        },
      },
    ],
  };
}
