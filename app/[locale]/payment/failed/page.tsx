import { Metadata } from 'next';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = { title: "To'lov — Xayr", robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaymentFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const p = (await getDictionary(lng)).payment;
  const { campaign } = await searchParams;
  const campaignHref = campaign ? `/${lng}/campaigns/${campaign}` : `/${lng}/campaigns`;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card p-8 text-center max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{p.failedTitle}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{p.failedDesc}</p>
            <ul className="text-sm text-gray-500 dark:text-gray-400 text-left list-disc pl-5 space-y-1 mb-6">
              <li>{p.reason1}</li>
              <li>{p.reason2}</li>
              <li>{p.reason3}</li>
            </ul>
            <div className="space-y-2">
              <Link href={campaignHref} className="btn-primary w-full py-3">{p.retry}</Link>
              <Link href={`/${lng}/campaigns`} className="btn-ghost w-full py-3">{p.allCampaigns}</Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
