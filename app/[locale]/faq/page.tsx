import type { Metadata } from 'next';
import { FaqList } from '@/components/faq/FaqList';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { serializeJsonLd } from '@/lib/security/json-ld';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  return pageMetadata({
    locale: loc,
    path: '/faq',
    title: dict.faqPage.title,
    description: dict.faqPage.subtitle,
  });
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  const f = dict.faqPage;

  // FAQPage structured data — makes the Q&A eligible for rich results.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: f.items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqLd) }}
      />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
              {f.title}
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">{f.subtitle}</p>
          </div>

          <FaqList
            items={f.items}
            categories={f.categories}
            allLabel={f.allLabel}
            searchPlaceholder={f.searchPlaceholder}
            noResults={f.noResults}
          />
        </div>
      </main>
    </>
  );
}
