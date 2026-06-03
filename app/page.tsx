import { createClient } from '@/lib/supabase/server';
import { Navbar }       from '@/components/layout/Navbar';
import { Footer }       from '@/components/layout/Footer';
import { HeroSection }  from '@/components/home/HeroSection';
import { HowItWorks }   from '@/components/home/HowItWorks';
import { CtaSection }   from '@/components/home/CtaSection';
import { CampaignGrid } from '@/components/campaigns/CampaignGrid';
import Link             from 'next/link';
import { ArrowRight }   from 'lucide-react';
import type { Campaign } from '@/types';

export const revalidate = 60;

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

        {/* Active campaigns */}
        <section id="campaigns" className="py-16 bg-gray-50 dark:bg-gray-950">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="section-title">Faol Kampaniyalar</h2>
                <p className="section-sub">Hozir yordam kerak bo'lgan kampaniyalar</p>
              </div>
              <Link
                href="/campaigns"
                className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                Barchasini ko'rish
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <CampaignGrid campaigns={campaigns} />
            <div className="mt-8 text-center sm:hidden">
              <Link href="/campaigns" className="btn-secondary w-full justify-center">
                Barcha kampaniyalar
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        <HowItWorks />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
