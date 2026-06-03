import { createClient } from '@/lib/supabase/server';
import { HeroSection } from '@/components/home/HeroSection';
import { CampaignGrid } from '@/components/campaigns/CampaignGrid';
import { HowItWorks } from '@/components/home/HowItWorks';
import { CtaSection } from '@/components/home/CtaSection';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import type { Campaign } from '@/types';

export const revalidate = 60; // ISR: revalidate every 60 seconds

async function getActiveCampaigns(): Promise<Campaign[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles(full_name, avatar_url)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {
      console.error('Error fetching campaigns:', error.message);
      return [];
    }
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const campaigns = await getActiveCampaigns();

  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <section id="campaigns" className="py-16 bg-gray-50 dark:bg-gray-950">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-10">
              <h2 className="section-title">Faol Kampaniyalar</h2>
              <p className="section-sub">Hozir yordam kerak bo'lgan kampaniyalar</p>
            </div>
            <CampaignGrid campaigns={campaigns} />
          </div>
        </section>
        <HowItWorks />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
