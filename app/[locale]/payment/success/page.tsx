import { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PaymentSuccessView } from '@/components/payments/PaymentSuccessView';

export const metadata: Metadata = { title: "To'lov — Xayr", robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaymentSuccessPage({
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string; campaign?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <PaymentSuccessView reference={sp.ref ?? null} campaignSlug={sp.campaign ?? null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
