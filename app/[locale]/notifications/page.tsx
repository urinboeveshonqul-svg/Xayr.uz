import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { NotificationsView } from '@/components/notifications/NotificationsView';
import { isLocale } from '@/i18n/config';
import type { Notification } from '@/types';

export const metadata: Metadata = { title: 'Bildirishnomalar — Xayr' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${lng}/auth/login?next=/notifications`);

  // RLS (notifications_select_own) already scopes to the current user.
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const initial: Notification[] = data ?? [];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <NotificationsView initial={initial} userId={user.id} locale={lng} />
        </div>
      </main>
      <Footer />
    </>
  );
}
