import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(isLocale(locale) ? (locale as Locale) : 'uz');
  return {
    title: `${dict.legal.privacy.title} — Xayr`,
    description: dict.legal.privacy.subtitle,
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(isLocale(locale) ? (locale as Locale) : 'uz');
  const doc = dict.legal.privacy;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <LegalDocument
            title={doc.title}
            subtitle={doc.subtitle}
            lastUpdatedLabel={dict.legal.lastUpdated}
            effectiveDate={dict.legal.effectiveDate}
            tocTitle={dict.legal.tocTitle}
            intro={doc.intro}
            sections={doc.sections as LegalSection[]}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
