import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import type { Campaign } from '@/types';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getCampaign(slug: string): Promise<Campaign | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles(full_name, avatar_url)')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    return data as unknown as Campaign;
  } catch {
    return null;
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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <CampaignDetail campaign={campaign} />
        </div>
      </main>
      <Footer />
    </>
  );
}
