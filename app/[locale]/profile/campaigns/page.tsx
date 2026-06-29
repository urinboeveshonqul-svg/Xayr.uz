import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { MyCampaigns, type MyCampaignRow, type MyExtensionRequest } from '@/components/profile/MyCampaigns';
import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

export const metadata: Metadata = { title: 'Mening kampaniyalarim — Xayr' };
export const dynamic = 'force-dynamic';

export default async function MyCampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(lng);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${lng}/auth/login?next=/profile/campaigns`);

  // RLS (campaigns_select_public) lets owners read their own rows in EVERY
  // status — pending/rejected/draft included; the explicit filter keeps the
  // query intent clear and indexed.
  const { data } = await supabase
    .from('campaigns')
    .select('id, title, slug, status, image_url, current_amount, goal_amount, donors_count, rejection_reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const campaigns: MyCampaignRow[] = data ?? [];

  // Owner's extension requests (RLS scopes to their own rows). Grouped by
  // campaign, newest first, so each card can show status + cancel + audit trail.
  // Degrades gracefully to {} if the extension migration hasn't been applied.
  const extensions: Record<string, MyExtensionRequest[]> = {};
  try {
    const { data: extData } = await supabase
      .from('campaign_extension_requests')
      .select('id, campaign_id, status, requested_deadline, previous_deadline, reason, reason_category, admin_note, created_at, reviewed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    for (const r of (extData ?? []) as MyExtensionRequest[]) {
      (extensions[r.campaign_id] ??= []).push(r);
    }
  } catch {
    // table not present yet — leave extensions empty
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h1 className="section-title">{dict.nav.myCampaigns}</h1>
              <p className="section-sub">{dict.dash.nCampaigns.replace('{count}', String(campaigns.length))}</p>
            </div>
          </div>

          <MyCampaigns campaigns={campaigns} locale={lng} extensions={extensions} />
        </div>
      </main>
      <Footer />
    </>
  );
}
