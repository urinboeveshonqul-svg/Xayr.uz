import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getPaymentCatalog, toProviderOptions } from '@/lib/payments/catalog';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { buildCampaignJsonLd } from '@/lib/campaign-jsonld';
import { serializeJsonLd } from '@/lib/security/json-ld';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import { CampaignTimeline, type TimelineExtension } from '@/components/campaigns/CampaignTimeline';
import { ViewTracker } from '@/components/campaigns/ViewTracker';
import { CompletionReportForm } from '@/components/campaigns/CompletionReportForm';
import { CompletionReports } from '@/components/campaigns/CompletionReports';
import { CampaignUpdates } from '@/components/campaigns/CampaignUpdates';
import { CampaignTeam, type TeamMemberRow } from '@/components/campaigns/CampaignTeam';
import { SimilarCampaigns } from '@/components/campaigns/SimilarCampaigns';
import { Comments } from '@/components/campaigns/Comments';
import type { Campaign, Donor, CampaignReport, CampaignUpdate } from '@/types';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

async function getCampaign(slug: string): Promise<Campaign | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url, bio, username), categories(slug)')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    return data as unknown as Campaign;
  } catch {
    return null;
  }
}

async function getDonors(campaignId: string): Promise<Donor[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_donors')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(10);
    return (data as unknown as Donor[]) ?? [];
  } catch {
    return [];
  }
}

// Completion reports are public (creports_select_all RLS). If the migration
// isn't applied yet, the query errors → we return [] and the section stays hidden.
async function getUpdates(campaignId: string): Promise<CampaignUpdate[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_updates')
      .select('id, campaign_id, user_id, title, content, images, documents, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    return (data as unknown as CampaignUpdate[]) ?? [];
  } catch {
    return [];
  }
}

// Team roster: split queries (members, then names) — no embed inference, no N+1.
// If the campaign-teams migration isn't applied, both return [] and the section hides.
async function getTeam(campaignId: string): Promise<TeamMemberRow[]> {
  try {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('campaign_team_members')
      .select('id, user_id, role, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (!rows || rows.length === 0) return [];

    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', rows.map((r) => r.user_id));
    const userById = new Map((users ?? []).map((u) => [u.id, u] as const));

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role,
      full_name: userById.get(r.user_id)?.full_name ?? null,
      avatar_url: userById.get(r.user_id)?.avatar_url ?? null,
    }));
  } catch {
    return [];
  }
}

async function getReports(campaignId: string): Promise<CampaignReport[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_reports')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    return (data as unknown as CampaignReport[]) ?? [];
  } catch {
    return [];
  }
}

// Public total withdrawn (paid payouts) — for the completion report transparency
// block. payout_requests is owner/admin-only, so we read the aggregate via RPC.
async function getWithdrawn(campaignId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc('campaign_total_withdrawn', { p_campaign_id: campaignId });
    return data ?? 0;
  } catch {
    return 0;
  }
}

// Public, non-sensitive extension timeline (dates only — never the reason).
async function getExtensionHistory(campaignId: string): Promise<TimelineExtension[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc('get_campaign_extension_history', { p_campaign_id: campaignId });
    return (data ?? []).map((e) => ({ approved_at: e.approved_at, new_deadline: e.new_deadline }));
  } catch {
    return [];
  }
}

async function getSimilar(campaign: Campaign): Promise<Campaign[]> {
  if (!campaign.category_id) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url), categories(slug)')
      .eq('status', 'active')
      .eq('category_id', campaign.category_id)
      .neq('id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(3);
    return (data as unknown as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const campaign = await getCampaign(slug);

  // Unknown campaign → noindex, still locale-aware.
  if (!campaign) {
    return pageMetadata({
      locale: loc,
      path: `/campaigns/${slug}`,
      title: 'Kampaniya topilmadi',
      noindex: true,
    });
  }

  // OpenGraph image is supplied by the colocated opengraph-image.tsx route, so
  // we deliberately omit `images` here and let Next.js merge in the file image.
  return pageMetadata({
    locale: loc,
    path: `/campaigns/${slug}`,
    title: campaign.title,
    description: campaign.description,
  });
}

export default async function CampaignDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  const loc = isLocale(locale) ? locale : 'uz';
  const campaign = await getCampaign(slug);

  if (!campaign) notFound();

  // Identify the viewer + their team role to gate the management sections.
  let isOwner = false;
  let viewerRole: TeamMemberRow['role'] | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isOwner = !!user && user.id === campaign.user_id;
    if (user && !isOwner) {
      const { data: m } = await supabase
        .from('campaign_team_members')
        .select('role')
        .eq('campaign_id', campaign.id)
        .eq('user_id', user.id)
        .maybeSingle();
      viewerRole = m?.role ?? null;
    }
  } catch {
    isOwner = false;
  }

  // Permission matrix: owner = full; manager = updates + reports; editor = updates.
  const canPostUpdates = isOwner || viewerRole !== null;
  const canManageReports = isOwner || viewerRole === 'owner' || viewerRole === 'manager';

  const [donors, similar, reports, updates, team] = await Promise.all([
    getDonors(campaign.id),
    getSimilar(campaign),
    getReports(campaign.id),
    getUpdates(campaign.id),
    getTeam(campaign.id),
  ]);

  const jsonLd = buildCampaignJsonLd(campaign, loc);

  // Public timeline only when the campaign was actually extended.
  const extended = (campaign.extension_count ?? 0) > 0;
  const extensions = extended ? await getExtensionHistory(campaign.id) : [];

  // Owner-only: a pending extension request keeps the campaign expired but the
  // donate area should say "under review" instead of the generic ended notice.
  let pendingExtension = false;
  if (isOwner && campaign.status === 'expired') {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from('campaign_extension_requests')
        .select('id')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .maybeSingle();
      pendingExtension = !!data;
    } catch {
      pendingExtension = false;
    }
  }

  // Completion report (one per campaign; RLS gives the public only an approved
  // one, the owner their own). Withdrawn total caps the fund-usage report.
  const report = reports[0] ?? null;
  // A verified success requires an admin-APPROVED completion report (public-facing).
  const hasApprovedReport = reports.some((r) => r.status === 'approved');
  const withdrawn = campaign.status === 'completed' ? await getWithdrawn(campaign.id) : 0;
  const beforeImages = [campaign.image_url, ...(campaign.images ?? [])].filter((s): s is string => !!s);

  return (
    <>
      {/* Per-campaign structured data (BreadcrumbList + WebPage + DonateAction) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <ViewTracker campaignId={campaign.id} />
          <CampaignDetail campaign={campaign} donors={donors} pendingExtension={pendingExtension} hasApprovedReport={hasApprovedReport} providers={toProviderOptions(await getPaymentCatalog())} />

          <div className="max-w-5xl mx-auto">
            {/* Public lifecycle timeline — shown when the campaign was extended */}
            {extended && (
              <CampaignTimeline
                createdAt={campaign.created_at}
                status={campaign.status}
                extensions={extensions}
                locale={loc}
              />
            )}

            {/* Owner-only entry point to the analytics dashboard */}
            {isOwner && (
              <Link
                href={`/${loc}/campaigns/${slug}/analytics`}
                className="mb-6 card p-4 flex items-center justify-between hover:shadow-md transition-all"
              >
                <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <BarChart3 className="w-5 h-5 text-brand-600" />
                  Kampaniya analitikasi
                </span>
                <span className="text-gray-400">→</span>
              </Link>
            )}

            {/* Team roster (public) + owner-only management */}
            <CampaignTeam campaignId={campaign.id} members={team} isOwner={isOwner} />

            {/* Completion report — moderated fund-usage report (approved is public;
                the owner also sees their pending/changes-requested/rejected report). */}
            {campaign.status === 'completed' && (
              <div id="completion-report" className="scroll-mt-24">
                <CompletionReports
                  report={report}
                  isOwner={canManageReports}
                  campaignId={campaign.id}
                  userId={campaign.user_id}
                  raised={campaign.current_amount ?? 0}
                  withdrawn={withdrawn}
                  beforeImages={beforeImages}
                />
              </div>
            )}

            {/* Submit form — owner/manager of a completed campaign with no report yet. */}
            {canManageReports && campaign.status === 'completed' && !report && (
              <CompletionReportForm campaignId={campaign.id} userId={campaign.user_id} totalWithdrawn={withdrawn} />
            )}

            <CampaignUpdates
              campaignId={campaign.id}
              campaignUserId={campaign.user_id}
              isOwner={canPostUpdates}
              initialUpdates={updates}
            />

            <Comments campaignId={campaign.id} />
            <SimilarCampaigns campaigns={similar} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
