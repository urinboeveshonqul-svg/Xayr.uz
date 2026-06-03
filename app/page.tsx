import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/home/Hero';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import Link from 'next/link';
import { ArrowRight, TrendingUp, Heart, Clock, Users } from 'lucide-react';
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

    if (error) return [];
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const campaigns = await getActiveCampaigns();
  const featured = campaigns.slice(0, 3);
  const emergency = campaigns.filter(c => c.category === 'disaster').slice(0, 4);
  const medical = campaigns.filter(c => c.category === 'medical').slice(0, 4);
  const education = campaigns.filter(c => c.category === 'education').slice(0, 4);

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <Hero />

        {/* Statistics */}
        <section className="py-16 bg-white border-b border-gray-100">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              {[
                { icon: Heart, value: '12,400+', label: 'Faol kampaniyalar', color: 'text-red-500' },
                { icon: Users, value: '89,000+', label: 'Xayriya qiluvchilar', color: 'text-blue-500' },
                { icon: TrendingUp, value: '₩ 4.2M', label: "Yig'ilgan mablag'", color: 'text-green-500' },
                { icon: Clock, value: '24/7', label: 'Texnik yordam', color: 'text-purple-500' },
              ].map((stat, i) => (
                <div key={i} className="text-center p-6 rounded-2xl bg-gray-50 hover:bg-white hover:shadow-lg transition-all duration-300">
                  <stat.icon className={`w-10 h-10 mx-auto mb-4 ${stat.color}`} />
                  <div className="text-3xl font-black text-gray-900 mb-2">{stat.value}</div>
                  <div className="text-sm text-gray-600 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Campaigns */}
        {featured.length > 0 && (
          <section className="py-20 bg-gradient-to-b from-white to-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <span className="inline-block px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold mb-4">
                  ⭐ TANLANGAN
                </span>
                <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-4">
                  Eng Ko'p Qo'llab-quvvatlanadigan
                </h2>
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  Jamiyat tomonidan eng ko'p e'tibor qaratilgan kampaniyalar
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

        {/* Emergency Campaigns */}
        {emergency.length > 0 && (
          <section className="py-20 bg-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <span className="inline-block px-4 py-2 bg-red-100 text-red-700 rounded-full text-sm font-bold mb-4">
                    🚨 SHOSHILINCH
                  </span>
                  <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-3">
                    Favqulodda Yordam
                  </h2>
                  <p className="text-lg text-gray-600">Darhol yordam kerak bo'lgan kampaniyalar</p>
                </div>
                <Link href="/campaigns?category=disaster" className="hidden md:flex items-center gap-2 text-red-600 font-bold hover:gap-3 transition-all">
                  Barchasini ko'rish <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {emergency.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} urgent />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Medical Campaigns */}
        {medical.length > 0 && (
          <section className="py-20 bg-gradient-to-b from-blue-50 to-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <span className="inline-block px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-bold mb-4">
                    🏥 TIBBIYOT
                  </span>
                  <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-3">
                    Tibbiy Yordam
                  </h2>
                  <p className="text-lg text-gray-600">Davolash uchun yordam kerak</p>
                </div>
                <Link href="/campaigns?category=medical" className="hidden md:flex items-center gap-2 text-blue-600 font-bold hover:gap-3 transition-all">
                  Barchasini ko'rish <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {medical.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Education Campaigns */}
        {education.length > 0 && (
          <section className="py-20 bg-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <span className="inline-block px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-sm font-bold mb-4">
                    📚 TA'LIM
                  </span>
                  <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-3">
                    Ta'lim Loyihalari
                  </h2>
                  <p className="text-lg text-gray-600">Kelajak avlod uchun sarmoya</p>
                </div>
                <Link href="/campaigns?category=education" className="hidden md:flex items-center gap-2 text-amber-600 font-bold hover:gap-3 transition-all">
                  Barchasini ko'rish <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {education.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Testimonials */}
        <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-4">
                Muvaffaqiyat Hikoyalari
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Xayr platformasi orqali o'z maqsadlariga erishganlar
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: 'Dilnoza Rahimova', role: 'Davolash kampaniyasi', quote: "O'g'limning operatsiyasi uchun zarur bo'lgan mablag'ni 15 kun ichida to'pladik. Sizlarga katta rahmat!" },
                { name: 'Jasur Karimov', role: "Kutubxona qurish", quote: "Qishloqimiz maktabiga zamonaviy kutubxona qurishga muvaffaq bo'ldik. 500 ta kitob sotib oldik." },
                { name: 'Malika Toshmatova', role: "Xayriya qiluvchi", quote: "Har oy 5-10 ta kampaniyaga yordam beraman. Bu platforma juda qulay va ishonchli." },
              ].map((testimonial, i) => (
                <div key={i} className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <div className="text-5xl text-green-500 mb-4">"</div>
                  <p className="text-gray-700 text-lg mb-6 leading-relaxed">{testimonial.quote}</p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-lg">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{testimonial.name}</div>
                      <div className="text-sm text-gray-500">{testimonial.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-br from-green-600 via-green-500 to-emerald-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTIgMi0yLTR6bTAgMTBjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTIgMi0yLTR6TTEwIDM0YzAtMiAyLTQgMi00czIgMiAyIDQtMiA0LTIgNC0yIDItMi00em0wIDEwYzAtMiAyLTQgMi00czIgMiAyIDQtMiA0LTIgNC0yIDItMi00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <h2 className="text-4xl lg:text-6xl font-black mb-6">
              Bugun Yaxshilik Qiling
            </h2>
            <p className="text-xl lg:text-2xl mb-10 max-w-3xl mx-auto opacity-95">
              Kampaniya yarating yoki sevganlaringizga yordam bering. <br />Har bir hissa muhim.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/campaigns/create" className="px-10 py-5 bg-white text-green-600 rounded-2xl text-lg font-black hover:bg-gray-50 hover:scale-105 transition-all duration-300 shadow-2xl">
                Loyiha Yaratish →
              </Link>
              <Link href="/campaigns" className="px-10 py-5 bg-green-700 text-white rounded-2xl text-lg font-black hover:bg-green-800 hover:scale-105 transition-all duration-300 border-2 border-white/30">
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
