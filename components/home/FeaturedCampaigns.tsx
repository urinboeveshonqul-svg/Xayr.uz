import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Flame, Users, Clock } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatMoney, getProgress, daysLeft, CATEGORY_CONFIG } from '@/lib/utils';
import type { Campaign } from '@/types';

interface FeaturedCampaignsProps {
  campaigns: Campaign[];
}

// Fallback image per category
const CATEGORY_IMAGES: Record<string, string> = {
  medical:     'https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200&q=80&auto=format&fit=crop',
  education:   'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&q=80&auto=format&fit=crop',
  disaster:    'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=1200&q=80&auto=format&fit=crop',
  community:   'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=80&auto=format&fit=crop',
  environment: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1200&q=80&auto=format&fit=crop',
  animal:      'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=1200&q=80&auto=format&fit=crop',
  sport:       'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=80&auto=format&fit=crop',
  other:       'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=1200&q=80&auto=format&fit=crop',
};

export function FeaturedCampaigns({ campaigns }: FeaturedCampaignsProps) {
  if (campaigns.length === 0) return null;

  // Featured = first urgent campaign, or first campaign
  const featured = campaigns.find((c) => c.is_urgent) ?? campaigns[0];
  const rest = campaigns.filter((c) => c.id !== featured.id).slice(0, 2);
  const cat = CATEGORY_CONFIG[featured.category];
  const pct = getProgress(featured.raised, featured.goal);
  const days = daysLeft(featured.deadline);
  const featuredImage =
    featured.image_url ?? CATEGORY_IMAGES[featured.category] ?? CATEGORY_IMAGES.other;

  return (
    <section className="py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="section-eyebrow mb-2">
              <Flame className="w-4 h-4" />
              Tanlangan kampaniya
            </span>
            <h2 className="section-title">Eng ko'p e'tiborga loyiq</h2>
          </div>
          <Link
            href="/campaigns"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:gap-2.5 transition-all"
          >
            Barchasini ko'rish
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Featured card (large) ──────────────────── */}
          <Link
            href={`/campaigns/${featured.slug}`}
            className="lg:col-span-3 group card-hover overflow-hidden"
          >
            {/* Image */}
            <div className="relative h-64 sm:h-80 lg:h-72 overflow-hidden">
              <Image
                src={featuredImage}
                alt={featured.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 1024px) 100vw, 60vw"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              {/* Badges over image */}
              <div className="absolute top-4 left-4 flex gap-2">
                <span className={`badge-pill ${cat.color} backdrop-blur-sm`}>
                  {cat.emoji} {cat.label}
                </span>
                {featured.is_urgent && (
                  <span className="badge-pill bg-red-500 text-white">
                    🆘 Shoshilinch
                  </span>
                )}
              </div>

              {/* Title over image */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2 group-hover:text-brand-200 transition-colors">
                  {featured.title}
                </h3>
              </div>
            </div>

            {/* Card body */}
            <div className="p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">
                {featured.description}
              </p>

              <div className="space-y-2 mb-4">
                <ProgressBar raised={featured.raised} goal={featured.goal} />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-bold text-brand-600 text-sm">
                    {formatMoney(featured.raised)} so'm
                  </span>
                  <span>{pct}% maqsaddan</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {featured.donors_count} donor
                </span>
                {days !== null && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {days > 0 ? `${days} kun qoldi` : 'Muddati tugagan'}
                  </span>
                )}
              </div>
            </div>
          </Link>

          {/* ── Side cards (2 small) ──────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {rest.length === 0 && (
              <div className="flex-1 card p-6 flex items-center justify-center text-center text-gray-400">
                <p className="text-sm">Ko'proq kampaniyalar tez orada...</p>
              </div>
            )}
            {rest.map((campaign) => {
              const c = CATEGORY_CONFIG[campaign.category];
              const img = campaign.image_url ?? CATEGORY_IMAGES[campaign.category] ?? CATEGORY_IMAGES.other;
              return (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.slug}`}
                  className="group card-hover overflow-hidden flex flex-col"
                >
                  <div className="relative h-40 overflow-hidden">
                    <Image
                      src={img}
                      alt={campaign.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 1024px) 100vw, 40vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className={`badge ${c.color} backdrop-blur-sm`}>
                        {c.emoji} {c.label}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-snug line-clamp-2 mb-2 group-hover:text-brand-600 transition-colors">
                      {campaign.title}
                    </h3>
                    <ProgressBar raised={campaign.raised} goal={campaign.goal} className="mt-auto" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                      <span className="font-semibold text-brand-600">{formatMoney(campaign.raised)} so'm</span>
                      <span>{getProgress(campaign.raised, campaign.goal)}%</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Mobile "see all" */}
        <div className="mt-6 text-center sm:hidden">
          <Link href="/campaigns" className="btn-secondary w-full justify-center">
            Barcha kampaniyalar
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
