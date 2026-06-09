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

  // Identify the viewer so the report form is shown only to the campaign owner.
  let isOwner = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isOwner = !!user && user.id === campaign.user_id;
  } catch {
    isOwner = false;
  }

  const [donors, similar, reports, updates] = await Promise.all([
    getDonors(campaign.id),
    getSimilar(campaign),
    getReports(campaign.id),
    getUpdates(campaign.id),
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

            {/* Completion reports — gallery + document viewer; owner can edit/delete */}
            {campaign.status === 'completed' && (
              <CompletionReports
                reports={reports}
                isOwner={isOwner}
                campaignId={campaign.id}
                userId={campaign.user_id}
              />
            )}

            {/* Creator-only publish form — owner of a completed campaign */}
            {isOwner && campaign.status === 'completed' && (
              <CompletionReportForm campaignId={campaign.id} userId={campaign.user_id} />
            )}

            <CampaignUpdates
              campaignId={campaign.id}
              campaignUserId={campaign.user_id}
              isOwner={isOwner}
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
