'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, Users, AlertCircle, Star } from 'lucide-react';
import { formatMoney, CATEGORY_CONFIG } from '@/lib/utils';
import { useI18n } from '@/components/i18n/I18nProvider';
import { SaveButton } from '@/components/campaigns/SaveButton';
import type { Campaign } from '@/types';

interface CampaignCardProps {
  campaign: Campaign;
  featured?: boolean;
  urgent?: boolean;
  /** When known by the parent (e.g. the Saved page), seeds the save state. */
  savedInitial?: boolean;
}

// Category-based placeholder images (used when a campaign has no uploaded image)
const CATEGORY_IMAGES: Record<string, string> = {
  medical:     'https://images.unsplash.com/photo-1584515933487-779824d29309?w=800&h=600&fit=crop&auto=format',
  education:   'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop&auto=format',
  disaster:    'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&h=600&fit=crop&auto=format',
  community:   'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=600&fit=crop&auto=format',
  environment: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=800&h=600&fit=crop&auto=format',
  animal:      'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=800&h=600&fit=crop&auto=format',
  sport:       'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&h=600&fit=crop&auto=format',
  other:       'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=800&h=600&fit=crop&auto=format',
};

export function CampaignCard({ campaign, featured, urgent, savedInitial }: CampaignCardProps) {
  const { t, locale } = useI18n();

  const raised  = campaign.current_amount ?? 0;
  const goal    = campaign.goal_amount    ?? 1;
  const percent = Math.min(100, Math.round((raised / goal) * 100));
  const categorySlug = campaign.categories?.slug ?? 'other';

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'medical':   return 'from-blue-500 to-blue-600';
      case 'education': return 'from-amber-500 to-amber-600';
      case 'disaster':  return 'from-red-500 to-red-600';
      case 'community': return 'from-purple-500 to-purple-600';
      default:          return 'from-green-500 to-emerald-600';
    }
  };

  const CatIcon = CATEGORY_CONFIG[categorySlug]?.Icon ?? Heart;

  const imageSrc =
    campaign.image_url ||
    campaign.cover_image ||
    CATEGORY_IMAGES[categorySlug] ||
    CATEGORY_IMAGES.other;

  const donors = campaign.total_donations ?? campaign.donors_count ?? 0;

  return (
    <Link
      href={`/${locale}/campaigns/${campaign.slug}`}
      className={`group flex flex-col bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-gray-100 ${
        featured ? 'ring-2 ring-green-500/30' : ''
      }`}
    >
      {/* Image — larger 4:3 cover, consistent across every card */}
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        <Image
          src={imageSrc}
          alt={campaign.title}
          fill
          quality={80}
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0" />

        {/* Category badge */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5">
          <CatIcon className="w-3.5 h-3.5" />
          {t(`categories.${categorySlug}`)}
        </div>

        {/* Top-right stack: save button + (urgent | featured) badge */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <SaveButton campaignId={campaign.id} initialSaved={savedInitial} />

          {(urgent || campaign.is_urgent) && (
            <div className="px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-black shadow-lg flex items-center gap-1 animate-pulse">
              <AlertCircle className="w-3 h-3" />
              {t('campaign.urgent')}
            </div>
          )}

          {featured && !urgent && !campaign.is_urgent && (
            <div className="px-3 py-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full text-xs font-black shadow-lg flex items-center gap-1">
              <Star className="w-3 h-3 fill-current" /> {t('home.featuredBadge')}
            </div>
          )}
        </div>

        {/* Progress bar over image */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-white/25 backdrop-blur-md rounded-full h-2 overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${getCategoryColor(categorySlug)} transition-all duration-500`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-1 space-y-4">
        {/* Organizer */}
        {campaign.profiles?.full_name && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs shadow">
              {campaign.profiles.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold truncate">{campaign.profiles.full_name}</span>
          </div>
        )}

        {/* Title */}
        <h3 className={`font-black text-gray-900 line-clamp-2 leading-tight group-hover:text-green-600 transition-colors ${featured ? 'text-xl' : 'text-lg'}`}>
          {campaign.title}
        </h3>

        {/* Description */}
        {campaign.description && (
          <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {campaign.description}
          </p>
        )}

        {/* Progress — primary trust signal */}
        <div className="pt-4 mt-auto border-t border-gray-100 space-y-2.5">
          <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${getCategoryColor(categorySlug)} transition-all duration-500`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-black text-gray-900 truncate">{formatMoney(raised)} so'm</div>
              <div className="text-xs text-gray-500 truncate">{formatMoney(goal)} {t('campaign.of')}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-base font-black text-green-600">{percent}%</div>
              <div className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                <Users className="w-3 h-3" />
                {donors}
              </div>
            </div>
          </div>
        </div>

        {/* CTA (decorative — whole card is the link) */}
        <span className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-sm group-hover:shadow-lg group-hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2">
          <Heart className="w-4 h-4" />
          {t('buttons.donateNow')}
        </span>
      </div>
    </Link>
  );
}
