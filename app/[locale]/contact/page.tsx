import type { Metadata } from 'next';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ContactForm } from '@/components/contact/ContactForm';
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
    path: '/contact',
    title: dict.contactPage.title,
    description: dict.contactPage.subtitle,
  });
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(isLocale(locale) ? (locale as Locale) : 'uz');
  const c = dict.contactPage;

  const details = [
    { icon: Mail, label: c.email, value: c.emailValue, href: `mailto:${c.emailValue}` },
    { icon: Phone, label: c.phone, value: c.phoneValue, href: `tel:${c.phoneValue.replace(/\s/g, '')}` },
    { icon: MapPin, label: c.address, value: c.addressValue, href: null },
    { icon: Clock, label: c.hours, value: c.hoursValue, href: null },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
              {c.title}
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
              {c.subtitle}
            </p>
          </div>

          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Contact details */}
            <aside className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">
                {c.infoTitle}
              </h2>
              {details.map((d) => {
                const Icon = d.icon;
                const content = (
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-500 dark:text-gray-400">{d.label}</div>
                      <div className="text-base font-semibold text-gray-900 dark:text-white break-words">
                        {d.value}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <div
                    key={d.label}
                    className="bg-white dark:bg-gray-900 rounded-2xl p-5 ring-1 ring-gray-100 dark:ring-gray-800"
                  >
                    {d.href ? (
                      <a href={d.href} className="block hover:opacity-80 transition-opacity">
                        {content}
                      </a>
                    ) : (
                      content
                    )}
                  </div>
                );
              })}
            </aside>

            {/* Form */}
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm ring-1 ring-gray-100 dark:ring-gray-800 p-6 sm:p-8">
                <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">
                  {c.form.title}
                </h2>
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
