import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { formatMoney, timeAgo } from '@/lib/utils';

export const metadata: Metadata = { title: 'Mening xayriyalarim — Xayr' };
export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  completed: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  failed: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  refunded: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

interface DonationRow {
  id: string;
  amount: number;
  message: string | null;
  status: string;
  created_at: string;
  campaigns: { title: string; slug: string } | null;
}

export default async function DonationsHistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(lng);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${lng}/auth/login?next=/profile/donations`);

  const { data } = await supabase
    .from('donations')
    .select('id, amount, message, status, created_at, campaigns(title, slug)')
    .eq('donor_id', user.id)
    .order('created_at', { ascending: false });

  const donations = (data as unknown as DonationRow[]) ?? [];

  const statusLabel: Record<string, string> = {
    pending: dict.donation.pending,
    completed: dict.donation.completed,
    failed: dict.donation.failed,
    refunded: dict.donation.refunded,
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <h1 className="section-title mb-8">{dict.donation.historyTitle}</h1>

          {donations.length === 0 ? (
            <div className="card p-12 text-center text-gray-500 dark:text-gray-400">
              {dict.donation.noDonations}
            </div>
          ) : (
            <div className="space-y-3">
              {donations.map((d) => (
                <div key={d.id} className="card p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    {d.campaigns ? (
                      <Link
                        href={`/${lng}/campaigns/${d.campaigns.slug}`}
                        className="font-semibold text-gray-900 dark:text-white hover:text-brand-600 truncate block"
                      >
                        {d.campaigns.title}
                      </Link>
                    ) : (
                      <span className="font-semibold text-gray-400">—</span>
                    )}
                    {d.message && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.message}</p>
                    )}
                    <p className="text-xs text-gray-400">{timeAgo(d.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-gray-900 dark:text-white">
                      {formatMoney(d.amount)} so&apos;m
                    </div>
                    <span className={`badge mt-1 ${STATUS_STYLES[d.status] ?? STATUS_STYLES.pending}`}>
                      {statusLabel[d.status] ?? d.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
