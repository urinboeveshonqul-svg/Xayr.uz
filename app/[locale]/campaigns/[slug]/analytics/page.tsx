import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Wallet, CalendarClock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { formatMoney } from '@/lib/utils';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignAnalytics } from '@/components/campaigns/CampaignAnalytics';

export const metadata: Metadata = { title: 'Kampaniya analitikasi — Xayr' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function CampaignAnalyticsPage({ params }: Props) {
  const { locale, slug } = await params;
  const loc = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${loc}/auth/login?next=/campaigns/${slug}/analytics`);

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, user_id, title, slug, goal_amount, current_amount, donors_count, views, status, deadline, created_at, original_deadline, extension_count')
    .eq('slug', slug)
    .single();

  if (!campaign) notFound();
  // Analytics are owner-only; non-owners go back to the public campaign page.
  if (campaign.user_id !== user.id) redirect(`/${loc}/campaigns/${slug}`);

  const [{ data: donationRows }, { data: chartRows }, { data: updateRows }] = await Promise.all([
    supabase
      .from('campaign_donors')
      .select('id, amount, donor_name, message, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('campaign_donors')
      .select('amount, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('campaign_updates')
      .select('id, title, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // Share traffic by source (owner-only RPC; [] if the migration isn't applied).
  const { data: shareRows } = await supabase.rpc('get_share_stats', { p_campaign_id: campaign.id });

  // Bucket completed donations into the last 14 days for the chart.
  const DAYS = 14;
  const byDay = new Map<string, number>();
  for (const d of chartRows ?? []) {
    const key = new Date(d.created_at).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + (d.amount ?? 0));
  }
  const chart: { label: string; total: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    chart.push({ label: String(d.getDate()), total: byDay.get(key) ?? 0 });
  }

  // Extension analytics (only for campaigns that were actually extended). The
  // "before/after" split uses the original end date as the boundary.
  const extended = (campaign.extension_count ?? 0) > 0;
  const orig = campaign.original_deadline;
  const boundary = orig ? new Date(orig).getTime() : 0;
  let beforeCount = 0, beforeAmount = 0, afterCount = 0, afterAmount = 0;
  if (extended && boundary) {
    for (const d of chartRows ?? []) {
      const ts = new Date(d.created_at).getTime();
      if (ts <= boundary) { beforeCount++; beforeAmount += d.amount ?? 0; }
      else { afterCount++; afterAmount += d.amount ?? 0; }
    }
  }
  const daysExtended =
    orig && campaign.deadline
      ? Math.max(0, Math.round((new Date(campaign.deadline).getTime() - boundary) / 86400000))
      : 0;
  const dd = dict.dash;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <CampaignAnalytics
            campaign={campaign}
            recentDonations={donationRows ?? []}
            recentUpdates={updateRows ?? []}
            chart={chart}
            shareStats={shareRows ?? []}
            locale={loc}
          />

          {/* Extension analytics — original/current end date, count, days, and
              donations split before vs after the original deadline. */}
          {extended && (
            <div className="card p-6 mt-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-brand-600" /> {dd.extAnTitle}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-xs text-gray-400">{dd.extAnOriginalEnd}</p>
                  <p className="text-sm font-black text-gray-900 dark:text-white break-words">{orig ? new Date(orig).toLocaleDateString(loc) : '—'}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-xs text-gray-400">{dd.extAnCurrentEnd}</p>
                  <p className="text-sm font-black text-gray-900 dark:text-white break-words">{campaign.deadline ? new Date(campaign.deadline).toLocaleDateString(loc) : '—'}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-xs text-gray-400">{dd.extAnCount}</p>
                  <p className="text-lg font-black text-gray-900 dark:text-white">{campaign.extension_count ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-xs text-gray-400">{dd.extAnDaysExtended}</p>
                  <p className="text-lg font-black text-gray-900 dark:text-white">{daysExtended}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-xs text-gray-400">{dd.extAnBefore}</p>
                  <p className="text-lg font-black text-gray-900 dark:text-white break-words">{formatMoney(beforeAmount)} so&apos;m</p>
                  <p className="text-xs text-gray-400">{beforeCount} {dd.extAnDonations}</p>
                </div>
                <div className="rounded-2xl bg-brand-50 dark:bg-brand-900/20 p-4">
                  <p className="text-xs text-brand-700/80 dark:text-brand-400/90">{dd.extAnAfter}</p>
                  <p className="text-lg font-black text-brand-700 dark:text-brand-400 break-words">{formatMoney(afterAmount)} so&apos;m</p>
                  <p className="text-xs text-gray-400">{afterCount} {dd.extAnDonations}</p>
                </div>
              </div>
            </div>
          )}

          {/* Withdrawals (and payout information) live on their own dedicated
              page — they intentionally do NOT appear here. This is just a link. */}
          {['active', 'completed', 'funded'].includes(campaign.status) && (
            <div className="mt-6">
              <Link
                href={`/${loc}/campaigns/${slug}/withdraw`}
                className="btn-primary px-5 py-2.5 inline-flex"
              >
                <Wallet className="w-4 h-4" /> {dict.dash.withdrawBtn}
              </Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
