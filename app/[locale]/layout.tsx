import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { notFound } from 'next/navigation';
import { locales, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });

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
  const dict = await getDictionary(isLocale(locale) ? locale : 'uz');
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    keywords: ['xayriya', 'crowdfunding', 'uzbekistan', 'kampaniya', 'fundraising'],
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: 'website',
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <I18nProvider locale={locale as Locale} messages={messages}>
          {children}
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
