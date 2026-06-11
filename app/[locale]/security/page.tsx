import type { Metadata } from 'next';
import {
  ShieldCheck, UserCheck, Eye, CreditCard, Lock, Flag, KeyRound, BadgeCheck, Headphones,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  return pageMetadata({
    locale: loc,
    path: '/security',
    title: dict.securityPage.title,
    description: dict.securityPage.subtitle,
  });
}

const SECTION_ICONS = [UserCheck, Eye, CreditCard, Lock, Flag, KeyRound];
const BADGE_ICONS = [ShieldCheck, BadgeCheck, Headphones];

export default async function SecurityPage({ params }: Props) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  const s = dict.securityPage;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-brand-600" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
              {s.title}
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">{s.subtitle}</p>
          </div>

          {/* Trust badges */}
          <div className="flex flex-row flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:gap-10 mb-12">
            {s.badges.map((label, i) => {
              const Icon = BADGE_ICONS[i] ?? ShieldCheck;
              return (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">{label}</span>
                </div>
              );
            })}
          </div>

          {/* Sections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {s.sections.map((section, i) => {
              const Icon = SECTION_ICONS[i] ?? ShieldCheck;
              return (
                <section key={i} className="card p-6">
                  <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-brand-600" />
                  </div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-white mb-2">{section.title}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{section.text}</p>
                </section>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
