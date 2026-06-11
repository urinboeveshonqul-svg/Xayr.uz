import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bookmark } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { Campaign } from '@/types';

export const metadata: Metadata = { title: 'Saqlangan kampaniyalar — Xayr' };
export const dynamic = 'force-dynamic';

interface SavedRow {
  campaign_id: string;
  created_at: string;
  campaigns: Campaign | null;
}

export default async function SavedCampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const d = (await getDictionary(lng)).dash;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${lng}/auth/login?next=/profile/saved`);

  // RLS (saved_select_own) already scopes this to the current user; the explicit
  // filter keeps the query intent clear and the index (idx_saved_user) in play.
  const { data } = await supabase
    .from('saved_campaigns')
    .select('campaign_id, created_at, campaigns(*, profiles:users(full_name, avatar_url), categories(slug))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const rows = (data as unknown as SavedRow[]) ?? [];
  // Drop any rows whose campaign was deleted; keep newest-first ordering.
  const campaigns = rows.map((r) => r.campaigns).filter((c): c is Campaign => !!c);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Bookmark className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h1 className="section-title">{d.savedCampaigns}</h1>
              <p className="section-sub">{d.nCampaigns.replace('{count}', String(campaigns.length))}</p>
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="card p-12 text-center">
              <Bookmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {d.savedEmpty}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {d.savedEmptyHint}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {campaigns.map((c) => (
                // Everything on this page is saved → seed the button state.
                <CampaignCard key={c.id} campaign={c} savedInitial />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
