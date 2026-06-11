import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { notFound } from 'next/navigation';
import { locales, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import { BottomNav } from '@/components/layout/BottomNav';
import { METADATA_BASE, SITE_URL, buildAlternates, ogLocaleMap, localeUrl } from '@/lib/seo';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });

// Browser-chrome (mobile address bar) theming. Matches the page surface per OS
// scheme: white in light mode, deep slate in dark. The PWA brand color lives in
// app/manifest.ts (theme_color #059669).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  // Required for env(safe-area-inset-*) to work on notched iPhones
  // (mobile bottom navigation + sticky donate bar).
  viewportFit: 'cover',
};

// Pre-render the three locales at build time (SEO-friendly static params).
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);

  return {
    // metadataBase makes every relative metadata URL (OG images, canonicals)
    // resolve against the production origin. Inherited by all child routes.
    metadataBase: METADATA_BASE,
    title: dict.meta.title,
    description: dict.meta.description,
    keywords: ['xayriya', 'crowdfunding', 'uzbekistan', 'kampaniya', 'fundraising', 'xayr'],
    // Canonical + hreflang for the locale home. Child pages override with their
    // own path-specific alternates.
    alternates: buildAlternates(loc, ''),
    openGraph: {
      type: 'website',
      siteName: 'Xayr',
      url: localeUrl(loc, ''),
      title: dict.meta.title,
      description: dict.meta.description,
      locale: ogLocaleMap[loc],
      alternateLocale: locales.filter((l) => l !== loc).map((l) => ogLocaleMap[l]),
    },
    twitter: {
      card: 'summary_large_image',
      title: dict.meta.title,
      description: dict.meta.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = await getDictionary(locale as Locale);

  // Structured data for search engines (Organization + WebSite with sitelinks
  // search box). Rendered once per page in the shared layout.
  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Xayr',
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'info@xayr.uz',
      telephone: '+998712000000',
    },
  };
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Xayr',
    url: SITE_URL,
    inLanguage: ['uz', 'ru', 'en'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${localeUrl(locale as Locale, '/campaigns')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />
        <I18nProvider locale={locale as Locale} messages={messages}>
          <EmailVerifyBanner />
          {children}
          <BottomNav />
        </I18nProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1f2937',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
            },
            success: { style: { background: '#16a34a' } },
            error: { style: { background: '#dc2626' } },
          }}
        />
      </body>
    </html>
  );
}
