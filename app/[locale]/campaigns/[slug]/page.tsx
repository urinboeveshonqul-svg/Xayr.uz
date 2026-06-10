import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
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
      .select('*, profiles:users(full_name, avatar_url, bio), categories(slug)')
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
      .select('id, full_name')
      .in('id', rows.map((r) => r.user_id));
    const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name] as const));

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role,
      full_name: nameById.get(r.user_id) ?? null,
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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <ViewTracker campaignId={campaign.id} />
          <CampaignDetail campaign={campaign} donors={donors} />

          <div className="max-w-5xl mx-auto">
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

            {/* Completion reports — gallery + document viewer; owner/manager can edit/delete */}
            {campaign.status === 'completed' && (
              <CompletionReports
                reports={reports}
                isOwner={canManageReports}
                campaignId={campaign.id}
                userId={campaign.user_id}
                beforeImages={[campaign.image_url, ...(campaign.images ?? [])].filter(
                  (s): s is string => !!s
                )}
              />
            )}

            {/* Publish form — owner/manager of a completed campaign */}
            {canManageReports && campaign.status === 'completed' && (
              <CompletionReportForm campaignId={campaign.id} userId={campaign.user_id} />
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
