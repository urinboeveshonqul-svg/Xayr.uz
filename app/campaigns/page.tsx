import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignsPageClient } from '@/components/campaigns/CampaignsPageClient';
import type { Campaign } from '@/types';

export const metadata: Metadata = {
  title: 'Kampaniyalar — Xayr',
  description: "Barcha faol xayriya kampaniyalarini ko'ring va yordam bering.",
};

export const revalidate = 60;

async function getCampaigns(): Promise<Campaign[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles(full_name, avatar_url)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error.message);
      return [];
    }
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-10">
            <h1 className="section-title">Barcha Kampaniyalar</h1>
            <p className="section-sub">
              {campaigns.length} ta faol kampaniya — yordam bering va o'zgarish yarating
            </p>
          </div>
          <CampaignsPageClient initialCampaigns={campaigns} />
        </div>
      </main>
      <Footer />
    </>
  );
}
