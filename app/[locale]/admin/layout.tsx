import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { AdminNav } from '@/components/admin/AdminNav';

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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="section-title mb-1">Admin Panel</h1>
          <p className="section-sub mb-6">Platformani boshqaring</p>
          <AdminNav />
          {children}
        </div>
      </main>
    </>
  );
}
