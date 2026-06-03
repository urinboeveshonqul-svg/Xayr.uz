import { createClient } from '@/lib/supabase/server';
import { Navbar }            from '@/components/layout/Navbar';
import { Footer }            from '@/components/layout/Footer';
import { HeroSection }       from '@/components/home/HeroSection';
import { StatsSection }      from '@/components/home/StatsSection';
import { FeaturedCampaigns } from '@/components/home/FeaturedCampaigns';
import { CampaignGrid }      from '@/components/campaigns/CampaignGrid';
import { HowItWorks }        from '@/components/home/HowItWorks';
import { SuccessStories }    from '@/components/home/SuccessStories';
import { CtaSection }        from '@/components/home/CtaSection';
import { ArrowRight }        from 'lucide-react';
import Link                  from 'next/link';
import type { Campaign }     from '@/types';

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

  // Trending = sorted by donors_count descending
  const trending = [...campaigns]
    .sort((a, b) => b.donors_count - a.donors_count)
    .slice(0, 8);

  return (
    <>
      <Navbar />
      <main>

        {/* 1. Hero */}
        <HeroSection />

        {/* 2. Stats */}
        <StatsSection />

        {/* 3. Featured / Spotlight */}
        <FeaturedCampaigns campaigns={campaigns} />

        {/* 4. Trending campaigns grid */}
        <section id="campaigns" className="py-16 bg-white dark:bg-gray-950">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="section-eyebrow mb-2">
                  <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
                  Kampaniyalar
                </span>
                <h2 className="section-title">Trendagi kampaniyalar</h2>
                <p className="section-sub">Eng ko'p donorlar jalb qilgan kampaniyalar</p>
              </div>
              <Link
                href="/campaigns"
                className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:gap-2.5 transition-all"
              >
                Barchasini ko'rish
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <CampaignGrid campaigns={trending} />

            {/* Mobile see all */}
            <div className="mt-8 text-center sm:hidden">
              <Link href="/campaigns" className="btn-secondary w-full justify-center">
                Barcha kampaniyalar
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* 5. How it works */}
        <HowItWorks />

        {/* 6. Success stories */}
        <SuccessStories />

        {/* 7. CTA */}
        <CtaSection />

      </main>
      <Footer />
    </>
  );
}
