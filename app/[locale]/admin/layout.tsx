import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminBadgeProvider } from '@/components/admin/AdminBadgeProvider';
import { getAdminBadgeCounts } from '@/lib/admin/badges';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

// Role-based access control for the whole /admin section (one place).
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ad = (await getDictionary(isLocale(locale) ? locale : 'uz')).admin;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/admin`);

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/${locale}`);

  // Badge counts are resolved here, AFTER the admin role check, so the numbers
  // are computed only for an authenticated admin. The layout is force-dynamic, so
  // navigating between admin tabs re-renders this with fresh counts; the provider
  // additionally refreshes them client-side after each admin action.
  const badgeCounts = await getAdminBadgeCounts();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="section-title mb-1">{ad.panelTitle}</h1>
          <p className="section-sub mb-6">{ad.panelSubtitle}</p>
          <AdminBadgeProvider initialCounts={badgeCounts}>
            <AdminNav />
            {children}
          </AdminBadgeProvider>
        </div>
      </main>
    </>
  );
}
