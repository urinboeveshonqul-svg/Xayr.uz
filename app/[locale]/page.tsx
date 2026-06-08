import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/home/Hero';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, TrendingUp, Heart, Users, ShieldCheck,
  Flame, Megaphone, HandHeart, Sparkles, CheckCircle2,
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import type { Campaign, CampaignReport } from '@/types';

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

// Real completed campaigns — the basis of the Success Stories section.
async function getCompletedCampaigns(): Promise<Campaign[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url), categories(slug)')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(6);

    if (error) return [];
    return (data as unknown as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

// Latest completion report per completed campaign (for Success Stories cards).
async function getCompletionReports(campaignIds: string[]): Promise<Map<string, CampaignReport>> {
  if (campaignIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_reports')
      .select('id, campaign_id, user_id, title, message, images, documents, created_at, updated_at')
      .in('campaign_id', campaignIds)
      .order('created_at', { ascending: false });

    const map = new Map<string, CampaignReport>();
    for (const r of (data as unknown as CampaignReport[]) ?? []) {
      // Keep only the most recent report per campaign (first in desc order).
      if (!map.has(r.campaign_id)) map.set(r.campaign_id, r);
    }
    return map;
  } catch {
    return new Map();
  }
}

interface PlatformStats {
  active: number;   // active campaigns
  donors: number;   // completed donations
  raised: number;   // sum of completed donation amounts
  verified: number; // verified users (creators)
}

/**
 * Real platform statistics, fetched server-side via the service-role client so
 * counts are accurate regardless of RLS. Every value falls back to 0 — there are
 * NO fake fallbacks. Any failure (missing service-role env, network) returns all
 * zeros instead of throwing, so the homepage never breaks.
 */
async function getPlatformStats(): Promise<PlatformStats> {
  const zero: PlatformStats = { active: 0, donors: 0, raised: 0, verified: 0 };
  try {
    const admin = createAdminClient();
    const [activeRes, donorsRes, verifiedRes, raisedRes] = await Promise.all([
      admin.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('donations').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      admin.from('users').select('*', { count: 'exact', head: true }).eq('verification_status', 'verified'),
      admin.from('donations').select('amount').eq('status', 'completed'),
    ]);
    const raised = (raisedRes.data ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0);
    return {
      active: activeRes.count ?? 0,
      donors: donorsRes.count ?? 0,
      verified: verifiedRes.count ?? 0,
      raised,
    };
  } catch {
    return zero;
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

  const [campaigns, platformStats, completedCampaigns] = await Promise.all([
    getActiveCampaigns(),
    getPlatformStats(),
    getCompletedCampaigns(),
  ]);

  const completionReports = await getCompletionReports(completedCampaigns.map((c) => c.id));

  const featured = campaigns.slice(0, 3);
  const featuredIds = new Set(featured.map((c) => c.id));
  const trending = [...campaigns]
    .sort((a, b) => (b.current_amount ?? 0) - (a.current_amount ?? 0))
    .filter((c) => !featuredIds.has(c.id))
    .slice(0, 8);

  // Real platform statistics only — no fake fallbacks; zero renders as 0.
  const stats = [
    { icon: Heart, value: platformStats.active.toLocaleString('uz-UZ'), label: dict.stats.active, color: 'text-red-500', bg: 'bg-red-50' },
    { icon: Users, value: platformStats.donors.toLocaleString('uz-UZ'), label: dict.stats.donors, color: 'text-blue-500', bg: 'bg-blue-50' },
    { icon: TrendingUp, value: `${formatMoney(platformStats.raised)} so'm`, label: dict.stats.raised, color: 'text-green-500', bg: 'bg-green-50' },
    { icon: ShieldCheck, value: platformStats.verified.toLocaleString('uz-UZ'), label: dict.stats.verified, color: 'text-purple-500', bg: 'bg-purple-50' },
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
        <Hero activeCampaigns={platformStats.active} donors={platformStats.donors} />

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

        {/* SUCCESS STORIES — real completed campaigns from Supabase. Hidden when none. */}
        {completedCampaigns.length > 0 && (
          <section className="py-20 lg:py-24 bg-gradient-to-b from-gray-50 to-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto mb-14">
                <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-4 tracking-tight">{dict.home.testimonialsTitle}</h2>
                <p className="text-lg text-gray-600">{dict.home.testimonialsSubtitle}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {completedCampaigns.map((c) => {
                  const report = completionReports.get(c.id) ?? null;
                  // Prefer first report image over campaign cover when a report exists.
                  const coverImage = (report?.images?.[0]) || c.image_url || null;
                  const excerpt = report
                    ? report.message.length > 140
                      ? report.message.slice(0, 140).trimEnd() + '…'
                      : report.message
                    : null;

                  return (
                    <Link
                      key={c.id}
                      href={L(`/campaigns/${c.slug}`)}
                      className="group bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col"
                    >
                      {/* Cover image */}
                      <div className="relative aspect-[4/3] bg-gray-100">
                        {coverImage ? (
                          <Image
                            src={coverImage}
                            alt={c.title}
                            fill
                            quality={80}
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-green-100 to-emerald-100" />
                        )}
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-green-600 text-white text-xs font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {dict.donation.completed}
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="p-5 flex flex-col flex-1">
                        {/* Campaign title */}
                        <h3 className="font-black text-gray-900 line-clamp-2 leading-tight group-hover:text-green-600 transition-colors">
                          {c.title}
                        </h3>
                        {c.profiles?.full_name && (
                          <p className="text-sm text-gray-500 mt-1">{c.profiles.full_name}</p>
                        )}

                        {/* Completion report block */}
                        {report && (
                          <div className="mt-3 p-3 rounded-2xl bg-green-50 border border-green-100">
                            <p className="text-xs font-bold text-green-700 mb-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {report.title}
                            </p>
                            {excerpt && (
                              <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                                {excerpt}
                              </p>
                            )}
                            {/* Thumbnail strip for extra report images */}
                            {report.images.length > 1 && (
                              <div className="flex gap-1.5 mt-2 overflow-hidden">
                                {report.images.slice(1, 4).map((src, i) => (
                                  <div
                                    key={i}
                                    className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt="" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Amount footer */}
                        <div className="mt-auto pt-4 border-t border-gray-100 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-black text-gray-900 truncate">{formatMoney(c.current_amount ?? 0)} so'm</div>
                            <div className="text-xs text-gray-500 truncate">{formatMoney(c.goal_amount ?? 0)} {dict.campaign.of}</div>
                          </div>
                          <div className="text-xs text-gray-400 flex-shrink-0">
                            {new Date(c.updated_at).toLocaleDateString(lng)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

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
