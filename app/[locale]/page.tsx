import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/home/Hero';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, TrendingUp, Heart, Users, ShieldCheck,
  Flame, Megaphone, HandHeart, Sparkles,
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import type { Campaign } from '@/types';

export const revalidate = 60;

async function getActiveCampaigns(): Promise<Campaign[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url), categories(slug)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(24);

    if (error) return [];
    return (data as unknown as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(lng);
  const L = (path: string) => `/${lng}${path}`;

  const campaigns = await getActiveCampaigns();

  const featured = campaigns.slice(0, 3);
  const featuredIds = new Set(featured.map((c) => c.id));
  const trending = [...campaigns]
    .sort((a, b) => (b.current_amount ?? 0) - (a.current_amount ?? 0))
    .filter((c) => !featuredIds.has(c.id))
    .slice(0, 8);

  const totalRaised = campaigns.reduce((sum, c) => sum + (c.current_amount ?? 0), 0);
  const totalDonors = campaigns.reduce((sum, c) => sum + (c.donors_count ?? 0), 0);
  const activeCount = campaigns.length;

  const stats = [
    { icon: Heart, value: activeCount > 0 ? `${activeCount}+` : '12,400+', label: dict.stats.active, color: 'text-red-500', bg: 'bg-red-50' },
    { icon: Users, value: totalDonors > 0 ? `${formatMoney(totalDonors)}+` : '89,000+', label: dict.stats.donors, color: 'text-blue-500', bg: 'bg-blue-50' },
    { icon: TrendingUp, value: totalRaised > 0 ? `${formatMoney(totalRaised)} so'm` : "4.2 mlrd", label: dict.stats.raised, color: 'text-green-500', bg: 'bg-green-50' },
    { icon: ShieldCheck, value: '100%', label: dict.stats.secure, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  const howItWorks = [
    { icon: Megaphone, title: dict.home.step1Title, text: dict.home.step1Text, color: 'from-green-500 to-emerald-600' },
    { icon: Sparkles, title: dict.home.step2Title, text: dict.home.step2Text, color: 'from-blue-500 to-indigo-600' },
    { icon: HandHeart, title: dict.home.step3Title, text: dict.home.step3Text, color: 'from-purple-500 to-pink-600' },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        <Hero />

        {/* STATISTICS */}
        <section className="py-16 lg:py-20 bg-white border-b border-gray-100">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
              {stats.map((stat, i) => (
                <div key={i} className="text-center p-6 lg:p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100">
                  <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-7 h-7 ${stat.color}`} />
                  </div>
                  <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 mb-1.5 break-words">{stat.value}</div>
                  <div className="text-xs sm:text-sm text-gray-600 font-semibold">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURED */}
        {featured.length > 0 && (
          <section className="py-20 lg:py-24 bg-gradient-to-b from-white to-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto mb-14">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold mb-5">
                  <Sparkles className="w-4 h-4" /> {dict.home.featuredBadge}
                </span>
                <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">{dict.home.featuredTitle}</h2>
                <p className="text-lg lg:text-xl text-gray-600">{dict.home.featuredSubtitle}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {featured.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} featured />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TRENDING */}
        {trending.length > 0 && (
          <section className="py-20 lg:py-24 bg-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
                <div>
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-bold mb-4">
                    <Flame className="w-4 h-4" /> {dict.home.trendingBadge}
                  </span>
                  <h2 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">{dict.home.trendingTitle}</h2>
                  <p className="text-base lg:text-lg text-gray-600 mt-2">{dict.home.trendingSubtitle}</p>
                </div>
                <Link href={L('/campaigns')} className="hidden sm:inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold hover:border-green-500 hover:text-green-600 hover:gap-3 transition-all shadow-sm">
                  {dict.buttons.seeAll} <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {trending.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
              <div className="mt-10 text-center sm:hidden">
                <Link href={L('/campaigns')} className="inline-flex items-center justify-center gap-2 w-full px-6 py-4 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold shadow-sm">
                  {dict.campaign.allCampaigns} <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* EMPTY STATE */}
        {campaigns.length === 0 && (
          <section className="py-24 bg-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-xl">
              <div className="flex justify-center mb-6">
                <Heart className="w-16 h-16 text-green-500 fill-green-500" />
              </div>
              <h2 className="text-3xl font-black text-gray-900 mb-4">{dict.home.emptyTitle}</h2>
              <p className="text-lg text-gray-600 mb-8">{dict.home.emptySubtitle}</p>
              <Link href={L('/campaigns/create')} className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl text-lg font-black shadow-xl hover:scale-105 transition-all">
                {dict.buttons.startCampaign} <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </section>
        )}

        {/* HOW IT WORKS */}
        <section className="py-20 lg:py-24 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold mb-5">
                <HandHeart className="w-4 h-4" /> {dict.home.howBadge}
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">{dict.home.howTitle}</h2>
              <p className="text-lg lg:text-xl text-gray-600">{dict.home.howSubtitle}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {howItWorks.map((step, i) => (
                <div key={i} className="relative text-center p-8 rounded-3xl bg-gray-50 hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <div className="absolute top-6 right-8 text-6xl font-black text-gray-100 select-none">{i + 1}</div>
                  <div className={`relative w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="relative text-xl font-black text-gray-900 mb-3">{step.title}</h3>
                  <p className="relative text-gray-600 leading-relaxed">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-20 lg:py-24 bg-gradient-to-b from-gray-50 to-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-4 tracking-tight">{dict.home.testimonialsTitle}</h2>
              <p className="text-lg text-gray-600">{dict.home.testimonialsSubtitle}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: 'Dilnoza Rahimova', role: dict.categories.medical, quote: "O'g'limning operatsiyasi uchun zarur bo'lgan mablag'ni 15 kun ichida to'pladik. Sizlarga katta rahmat!", image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=128&h=128&fit=crop&auto=format' },
                { name: 'Jasur Karimov', role: dict.categories.education, quote: 'Qishloqimiz maktabiga zamonaviy kutubxona qurishga muvaffaq bo\'ldik.', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&fit=crop&auto=format' },
                { name: 'Malika Toshmatova', role: dict.categories.community, quote: 'Har oy 5-10 ta kampaniyaga yordam beraman. Bu platforma juda qulay va ishonchli.', image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=128&h=128&fit=crop&auto=format' },
              ].map((tItem, i) => (
                <div key={i} className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <div className="text-6xl text-green-500 leading-none mb-4 font-serif">&ldquo;</div>
                  <p className="text-gray-700 text-lg mb-6 leading-relaxed">{tItem.quote}</p>
                  <div className="flex items-center gap-4">
                    <Image
                      src={tItem.image}
                      alt={tItem.name}
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-green-100"
                    />
                    <div>
                      <div className="font-bold text-gray-900">{tItem.name}</div>
                      <div className="text-sm text-gray-500">{tItem.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-gradient-to-br from-green-600 via-green-500 to-emerald-600 text-white relative overflow-hidden">
          {/* Community/volunteer imagery, blended softly behind the gradient for warmth */}
          <Image
            src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=700&fit=crop&auto=format"
            alt=""
            fill
            aria-hidden
            className="object-cover opacity-20 mix-blend-overlay pointer-events-none"
            sizes="100vw"
          />
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <h2 className="text-4xl lg:text-6xl font-black mb-6 tracking-tight">{dict.home.ctaTitle}</h2>
            <p className="text-xl lg:text-2xl mb-10 max-w-3xl mx-auto opacity-95">{dict.home.ctaSubtitle}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href={L('/campaigns/create')} className="px-10 py-5 bg-white text-green-600 rounded-2xl text-lg font-black hover:bg-gray-50 hover:scale-105 transition-all duration-300 shadow-2xl">
                {dict.buttons.startCampaign} →
              </Link>
              <Link href={L('/campaigns')} className="px-10 py-5 bg-green-700/80 text-white rounded-2xl text-lg font-black hover:bg-green-800 hover:scale-105 transition-all duration-300 border-2 border-white/30 backdrop-blur-sm">
                {dict.buttons.donateNow}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
