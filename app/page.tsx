import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/home/Hero';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import Link from 'next/link';
import {
  ArrowRight, TrendingUp, Heart, Users, ShieldCheck,
  Flame, Megaphone, HandHeart, Sparkles,
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
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
      .limit(24);

    if (error) return [];
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const campaigns = await getActiveCampaigns();

  // Featured = newest 3. Trending = most raised. Avoid showing the same items twice.
  const featured = campaigns.slice(0, 3);
  const featuredIds = new Set(featured.map((c) => c.id));
  const trending = [...campaigns]
    .sort((a, b) => (b.raised ?? 0) - (a.raised ?? 0))
    .filter((c) => !featuredIds.has(c.id))
    .slice(0, 8);

  // Real aggregate stats with graceful fallbacks for an empty database.
  const totalRaised = campaigns.reduce((sum, c) => sum + (c.raised ?? 0), 0);
  const totalDonors = campaigns.reduce((sum, c) => sum + (c.donors_count ?? 0), 0);
  const activeCount = campaigns.length;

  const stats = [
    {
      icon: Heart,
      value: activeCount > 0 ? `${activeCount}+` : '12,400+',
      label: 'Faol kampaniyalar',
      color: 'text-red-500',
      bg: 'bg-red-50',
    },
    {
      icon: Users,
      value: totalDonors > 0 ? `${formatMoney(totalDonors)}+` : '89,000+',
      label: 'Xayriya qiluvchilar',
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      icon: TrendingUp,
      value: totalRaised > 0 ? `${formatMoney(totalRaised)} so'm` : "4.2 mlrd so'm",
      label: "Yig'ilgan mablag'",
      color: 'text-green-500',
      bg: 'bg-green-50',
    },
    {
      icon: ShieldCheck,
      value: '100%',
      label: 'Xavfsiz to\'lovlar',
      color: 'text-purple-500',
      bg: 'bg-purple-50',
    },
  ];

  const howItWorks = [
    {
      icon: Megaphone,
      title: 'Kampaniya yarating',
      text: 'Hikoyangizni yozing, maqsad summangizni belgilang va rasm qo\'shing. Bir necha daqiqada tayyor.',
      color: 'from-green-500 to-emerald-600',
    },
    {
      icon: Sparkles,
      title: 'Ulashing',
      text: 'Kampaniyangizni do\'stlaringiz va ijtimoiy tarmoqlarda ulashing — qancha ko\'p ko\'rsa, shuncha yaxshi.',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      icon: HandHeart,
      title: 'Mablag\' yig\'ing',
      text: 'Xayriyalarni qabul qiling, jamiyatdan qo\'llab-quvvatlanish oling va maqsadingizga erishing.',
      color: 'from-purple-500 to-pink-600',
    },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        {/* ─── HERO ──────────────────────────────────────── */}
        <Hero />

        {/* ─── STATISTICS ────────────────────────────────── */}
        <section className="py-16 lg:py-20 bg-white border-b border-gray-100">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
              {stats.map((stat, i) => (
                <div
                  key={i}
                  className="text-center p-6 lg:p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100"
                >
                  <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-7 h-7 ${stat.color}`} />
                  </div>
                  <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 mb-1.5 break-words">
                    {stat.value}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600 font-semibold">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FEATURED CAMPAIGNS ────────────────────────── */}
        {featured.length > 0 && (
          <section className="py-20 lg:py-24 bg-gradient-to-b from-white to-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto mb-14">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold mb-5">
                  <Sparkles className="w-4 h-4" /> TANLANGAN
                </span>
                <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
                  Tanlangan Kampaniyalar
                </h2>
                <p className="text-lg lg:text-xl text-gray-600">
                  Jamiyat tomonidan eng ko'p e'tibor qaratilgan loyihalar
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {featured.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} featured />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── TRENDING CAMPAIGNS ────────────────────────── */}
        {trending.length > 0 && (
          <section className="py-20 lg:py-24 bg-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
                <div>
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-bold mb-4">
                    <Flame className="w-4 h-4" /> OMMABOP
                  </span>
                  <h2 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">
                    Ommabop Kampaniyalar
                  </h2>
                  <p className="text-base lg:text-lg text-gray-600 mt-2">
                    Hozir eng ko'p qo'llab-quvvatlanayotgan loyihalar
                  </p>
                </div>
                <Link
                  href="/campaigns"
                  className="hidden sm:inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold hover:border-green-500 hover:text-green-600 hover:gap-3 transition-all shadow-sm"
                >
                  Barchasini ko'rish <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {trending.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
              <div className="mt-10 text-center sm:hidden">
                <Link
                  href="/campaigns"
                  className="inline-flex items-center justify-center gap-2 w-full px-6 py-4 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold shadow-sm"
                >
                  Barcha kampaniyalar <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ─── EMPTY STATE (no campaigns yet) ────────────── */}
        {campaigns.length === 0 && (
          <section className="py-24 bg-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-xl">
              <div className="text-7xl mb-6">💚</div>
              <h2 className="text-3xl font-black text-gray-900 mb-4">
                Birinchi kampaniyani siz boshlang
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Hozircha faol kampaniyalar yo'q. O'z loyihangizni yarating va
                jamiyat yordamini to'plang.
              </p>
              <Link
                href="/campaigns/create"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl text-lg font-black shadow-xl hover:scale-105 transition-all"
              >
                Loyiha Yaratish <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </section>
        )}

        {/* ─── HOW IT WORKS ──────────────────────────────── */}
        <section className="py-20 lg:py-24 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold mb-5">
                <HandHeart className="w-4 h-4" /> QANDAY ISHLAYDI
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
                Uch oddiy qadam
              </h2>
              <p className="text-lg lg:text-xl text-gray-600">
                Kampaniya yaratish va mablag' yig'ish hech qachon bunchalik oson bo'lmagan
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {howItWorks.map((step, i) => (
                <div
                  key={i}
                  className="relative text-center p-8 rounded-3xl bg-gray-50 hover:shadow-xl transition-all duration-300 border border-gray-100"
                >
                  <div className="absolute top-6 right-8 text-6xl font-black text-gray-100 select-none">
                    {i + 1}
                  </div>
                  <div className={`relative w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="relative text-xl font-black text-gray-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="relative text-gray-600 leading-relaxed">
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── TESTIMONIALS ──────────────────────────────── */}
        <section className="py-20 lg:py-24 bg-gradient-to-b from-gray-50 to-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-4 tracking-tight">
                Muvaffaqiyat Hikoyalari
              </h2>
              <p className="text-lg text-gray-600">
                Xayr platformasi orqali o'z maqsadlariga erishganlar
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: 'Dilnoza Rahimova', role: 'Davolash kampaniyasi', quote: "O'g'limning operatsiyasi uchun zarur bo'lgan mablag'ni 15 kun ichida to'pladik. Sizlarga katta rahmat!" },
                { name: 'Jasur Karimov', role: 'Kutubxona qurish', quote: 'Qishloqimiz maktabiga zamonaviy kutubxona qurishga muvaffaq bo\'ldik. 500 ta kitob sotib oldik.' },
                { name: 'Malika Toshmatova', role: 'Xayriya qiluvchi', quote: 'Har oy 5-10 ta kampaniyaga yordam beraman. Bu platforma juda qulay va ishonchli.' },
              ].map((t, i) => (
                <div
                  key={i}
                  className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100"
                >
                  <div className="text-6xl text-green-500 leading-none mb-4 font-serif">&ldquo;</div>
                  <p className="text-gray-700 text-lg mb-6 leading-relaxed">{t.quote}</p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-black text-lg">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{t.name}</div>
                      <div className="text-sm text-gray-500">{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────── */}
        <section className="py-24 bg-gradient-to-br from-green-600 via-green-500 to-emerald-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTIgMi0yLTR6bTAgMTBjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTIgMi0yLTR6TTEwIDM0YzAtMiAyLTQgMi00czIgMiAyIDQtMiA0LTIgNC0yIDItMi00em0wIDEwYzAtMiAyLTQgMi00czIgMiAyIDQtMiA0LTIgNC0yIDItMi00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <h2 className="text-4xl lg:text-6xl font-black mb-6 tracking-tight">
              Bugun Yaxshilik Qiling
            </h2>
            <p className="text-xl lg:text-2xl mb-10 max-w-3xl mx-auto opacity-95">
              Kampaniya yarating yoki sevganlaringizga yordam bering. <br className="hidden sm:block" />
              Har bir hissa muhim.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/campaigns/create"
                className="px-10 py-5 bg-white text-green-600 rounded-2xl text-lg font-black hover:bg-gray-50 hover:scale-105 transition-all duration-300 shadow-2xl"
              >
                Loyiha Yaratish →
              </Link>
              <Link
                href="/campaigns"
                className="px-10 py-5 bg-green-700/80 text-white rounded-2xl text-lg font-black hover:bg-green-800 hover:scale-105 transition-all duration-300 border-2 border-white/30 backdrop-blur-sm"
              >
                Yordam Berish
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
