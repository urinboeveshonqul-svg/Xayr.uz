import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import { SimilarCampaigns } from '@/components/campaigns/SimilarCampaigns';
import { Comments } from '@/components/campaigns/Comments';
import type { Campaign, Donor } from '@/types';

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
  const { slug } = await params;
  const campaign = await getCampaign(slug);
  if (!campaign) return { title: 'Kampaniya topilmadi — Xayr' };
  return {
    title: `${campaign.title} — Xayr`,
    description: campaign.description,
  };
}

export default async function CampaignDetailPage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getCampaign(slug);

  if (!campaign) notFound();

  const [donors, similar] = await Promise.all([
    getDonors(campaign.id),
    getSimilar(campaign),
  ]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <CampaignDetail campaign={campaign} donors={donors} />

          <div className="max-w-5xl mx-auto">
            <Comments campaignId={campaign.id} />
            <SimilarCampaigns campaigns={similar} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
