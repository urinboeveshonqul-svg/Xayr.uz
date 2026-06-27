import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isLocale } from '@/i18n/config';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignAnalytics } from '@/components/campaigns/CampaignAnalytics';
import { CampaignPayouts, type CampaignPayoutRow, type PayoutInfoDisplay } from '@/components/campaigns/CampaignPayouts';
import { cardTypeLabel, maskCard, maskCardDisplay } from '@/lib/payout';
import { UZ, nationalDigitsFrom, formatNational } from '@/lib/phone';

export const metadata: Metadata = { title: 'Kampaniya analitikasi — Xayr' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function CampaignAnalyticsPage({ params }: Props) {
  const { locale, slug } = await params;
  const loc = isLocale(locale) ? locale : 'uz';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${loc}/auth/login?next=/campaigns/${slug}/analytics`);

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, user_id, title, slug, goal_amount, current_amount, donors_count, views, status, deadline, created_at')
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

  // ── Withdrawal / payout data (owner-only; RLS scopes reads to the owner) ──
  const { data: payoutRows } = await supabase
    .from('payout_requests')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: false });
  const payoutRequests = payoutRows ?? [];

  const { data: payoutEventRows } = await supabase
    .from('payout_request_events')
    .select('*')
    .in('request_id', payoutRequests.map((r) => r.id))
    .order('created_at', { ascending: true });
  const payoutEvents = payoutEventRows ?? [];

  const { data: profile } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', user.id)
    .single();

  // Saved payout account (owner-only via RLS). The full card number is NEVER
  // serialized to the client — only masked display fields are passed; the full
  // card is snapshotted server-side at request time.
  let payoutAccount: {
    full_legal_name: string;
    phone_number: string;
    card_type: string;
    card_number: string;
    cardholder_name: string;
    bank_name: string | null;
  } | null = null;
  try {
    const { data } = await supabase
      .from('payout_accounts')
      .select('full_legal_name, phone_number, card_type, card_number, cardholder_name, bank_name')
      .eq('user_id', user.id)
      .maybeSingle();
    payoutAccount = data ?? null;
  } catch {
    payoutAccount = null;
  }
  const payoutSummary = payoutAccount
    ? `${cardTypeLabel(payoutAccount.card_type)} · ${maskCard(payoutAccount.card_number)}`
    : null;

  // Masked, client-safe projection for the read-only payout card. The card is
  // masked here (BIN + last 4) so the full PAN stays server-side.
  const payoutInfo: PayoutInfoDisplay | null = payoutAccount
    ? {
        fullLegalName: payoutAccount.full_legal_name,
        phone: `${UZ.dialCode} ${formatNational(nationalDigitsFrom(payoutAccount.phone_number))}`,
        cardType: payoutAccount.card_type,
        cardMasked: maskCardDisplay(payoutAccount.card_number),
        cardholderName: payoutAccount.cardholder_name,
        bankName: payoutAccount.bank_name,
      }
    : null;

  // Mirrors campaign_available_balance(): committed = active + paid.
  const COMMITTED = ['pending_review', 'approved', 'info_requested', 'paid'];
  const committed = payoutRequests
    .filter((r) => COMMITTED.includes(r.status))
    .reduce((sum, r) => sum + r.amount, 0);
  const available = Math.max(0, (campaign.current_amount ?? 0) - committed);
  // Total successfully withdrawn (gross amounts that have left the balance).
  const totalWithdrawn = payoutRequests
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + r.amount, 0);

  const eventsByReq = new Map<string, typeof payoutEvents>();
  for (const e of payoutEvents) {
    const arr = eventsByReq.get(e.request_id) ?? [];
    arr.push(e);
    eventsByReq.set(e.request_id, arr);
  }
  const payoutRequestRows: CampaignPayoutRow[] = payoutRequests.map((r) => ({
    ...r,
    events: eventsByReq.get(r.id) ?? [],
  }));

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

          <CampaignPayouts
            campaignId={campaign.id}
            campaignStatus={campaign.status}
            available={available}
            raised={campaign.current_amount ?? 0}
            totalWithdrawn={totalWithdrawn}
            isVerified={profile?.verification_status === 'verified'}
            hasPayoutInfo={!!payoutAccount}
            payoutSummary={payoutSummary}
            payoutInfo={payoutInfo}
            requests={payoutRequestRows}
            locale={loc}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
