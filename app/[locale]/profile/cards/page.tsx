import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isLocale } from '@/i18n/config';
import { SavedCards } from '@/components/profile/SavedCards';

export const metadata: Metadata = { title: 'Saqlangan kartalar — Xayr' };
export const dynamic = 'force-dynamic';

// The whole feature is behind one flag. Off ⇒ the page does not exist (404), so
// there is no UI path to any saved-card API when the feature is disabled.
const SAVED_CARDS_ENABLED = process.env.NEXT_PUBLIC_CLICK_SAVED_CARDS === '1';

/**
 * Account → Saved Cards. Owner-only. Lets the user view / add / set-default /
 * delete saved Click cards. The list + all mutations are the user's own via RLS
 * and the owner-scoped RPCs; the encrypted token is never fetched here.
 */
export default async function SavedCardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';

  if (!SAVED_CARDS_ENABLED) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${lng}/auth/login?next=/profile/cards`);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
        <div className="card p-5 sm:p-6">
          <SavedCards />
        </div>
      </div>
    </main>
  );
}
