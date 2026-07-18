import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignPayouts, type CampaignPayoutRow, type PayoutInfoDisplay } from '@/components/campaigns/CampaignPayouts';
import { CampaignFinancials } from '@/components/campaigns/CampaignFinancials';
import { cardTypeLabel, maskFromLast4, maskDisplayFromLast4 } from '@/lib/payout';
import { UZ, nationalDigitsFrom, formatNational } from '@/lib/phone';

export const metadata: Metadata = { title: "Mablag' yechish — Xayr" };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * Dedicated Withdrawal page — the ONLY place the payout workflow lives (it is
 * deliberately absent from the Profile and Analytics pages). Owner-only.
 *
 * The page renders, in order: Available Balance → Saved Payout Information (or
 * the payout form when missing) → Withdrawal Request Form → Withdrawal History,
 * all via <CampaignPayouts>, which already enforces that order internally.
 */
export default async function CampaignWithdrawPage({ params }: Props) {
  const { locale, slug } = await params;
  const loc = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${loc}/auth/login?next=/campaigns/${slug}/withdraw`);

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, user_id, title, slug, current_amount, goal_amount, status')
    .eq('slug', slug)
    .single();

  if (!campaign) notFound();
  // Withdrawals are owner-only; non-owners go back to the public campaign page.
  if (campaign.user_id !== user.id) redirect(`/${loc}/campaigns/${slug}`);

  // ── Withdrawal / payout data (owner-only; RLS scopes reads to the owner) ──
  const { data: payoutRows } = await supabase
    .from('payout_requests')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: false });

  // Never serialize the full card number into the page payload. Derive the
  // masked last-4 server-side (falling back to the legacy plaintext snapshot for
  // rows not yet backfilled) and strip the PAN.
  const payoutRequests = (payoutRows ?? []).map((r) => ({
    ...r,
    snap_secret_last4:
      r.snap_secret_last4 ?? ((r.snap_card_number ?? '').replace(/\D/g, '').slice(-4) || null),
    snap_card_number: null,
  }));

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
    card_number: string | null;
    secret_last4: string | null;
    cardholder_name: string;
    bank_name: string | null;
  } | null = null;
  try {
    const { data } = await supabase
      .from('payout_accounts')
      .select('full_legal_name, phone_number, card_type, card_number, secret_last4, cardholder_name, bank_name')
      .eq('user_id', user.id)
      .maybeSingle();
    payoutAccount = data ?? null;
  } catch {
    payoutAccount = null;
  }

  // PHASE 2: prefer the stored last-4 (no PAN involved at all); fall back to
  // deriving it from the legacy plaintext column only while that column still
  // exists. Phase 3 removes the fallback along with the column.
  const cardLast4 = payoutAccount
    ? payoutAccount.secret_last4 ?? (payoutAccount.card_number ?? '').replace(/\D/g, '').slice(-4)
    : '';

  const payoutSummary = payoutAccount
    ? `${cardTypeLabel(payoutAccount.card_type)} · ${maskFromLast4(cardLast4)}`
    : null;

  // Masked, client-safe projection for the read-only payout card. Built from the
  // last-4 only, so the full PAN is never serialized into the page payload.
  const payoutInfo: PayoutInfoDisplay | null = payoutAccount
    ? {
        fullLegalName: payoutAccount.full_legal_name,
        phone: `${UZ.dialCode} ${formatNational(nationalDigitsFrom(payoutAccount.phone_number))}`,
        cardType: payoutAccount.card_type,
        cardMasked: maskDisplayFromLast4(cardLast4),
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

  // ── Per-campaign financial breakdown (computed from tamper-proof data) ──
  const raised = campaign.current_amount ?? 0;
  const paidReqs = payoutRequests.filter((r) => r.status === 'paid');
  const platformFee = paidReqs.reduce((s, r) => s + (r.commission_amount ?? 0), 0);
  const netToCreator = paidReqs.reduce((s, r) => s + (r.payout_amount ?? r.amount), 0);
  const pendingWithdrawal = payoutRequests
    .filter((r) => ['pending_review', 'approved', 'info_requested'].includes(r.status))
    .reduce((s, r) => s + r.amount, 0);

  // Completion-report stage of the money-flow timeline (best-effort; tolerant of
  // a not-yet-applied reports migration).
  let hasApprovedReport = false;
  try {
    const { count } = await supabase
      .from('campaign_reports')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'approved');
    hasApprovedReport = (count ?? 0) > 0;
  } catch {
    hasApprovedReport = false;
  }

  const cf = dict.campaignFinance;
  const financialsData = {
    goal: campaign.goal_amount ?? 0,
    raised,
    platformFee,
    providerFee: 0,
    netAmount: netToCreator,
    totalWithdrawn,
    availableBalance: available,
    pendingWithdrawal,
    remainingBalance: available,
  };
  const timeline = [
    { label: cf.tDonation, done: raised > 0 },
    { label: cf.tConfirmed, done: raised > 0 },
    { label: cf.tAvailable, done: available > 0 || totalWithdrawn > 0 },
    { label: cf.tRequested, done: payoutRequests.length > 0 },
    { label: cf.tApproved, done: payoutRequests.some((r) => ['approved', 'paid'].includes(r.status)) },
    { label: cf.tSent, done: totalWithdrawn > 0 },
    { label: cf.tReport, done: hasApprovedReport },
  ];

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
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <Link
            href={`/${loc}/campaigns/${slug}/analytics`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {dict.dash.backToCampaign}
          </Link>
          <h1 className="section-title mt-2">{dict.dash.withdrawBtn}</h1>
          <p className="section-sub break-words">{campaign.title}</p>

          <div className="mt-6">
            <CampaignFinancials
              data={financialsData}
              timeline={timeline}
              labels={{
                title: cf.title,
                subtitle: cf.subtitle,
                goal: cf.goal,
                raised: cf.raised,
                platformFee: cf.platformFee,
                providerFee: cf.providerFee,
                netAmount: cf.netAmount,
                totalWithdrawn: cf.totalWithdrawn,
                availableBalance: cf.availableBalance,
                pendingWithdrawal: cf.pendingWithdrawal,
                remainingBalance: cf.remainingBalance,
                timelineTitle: cf.timelineTitle,
              }}
            />
          </div>

          <CampaignPayouts
            campaignId={campaign.id}
            campaignStatus={campaign.status}
            userId={user.id}
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
