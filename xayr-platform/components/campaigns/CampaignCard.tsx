import Link from 'next/link';
import Image from 'next/image';
import { Clock, Users, Zap } from 'lucide-react';
import { cn, formatMoney, getProgress, daysLeft, CATEGORY_CONFIG } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Campaign } from '@/types';

// High-quality fallback images per category
const FALLBACK_IMAGES: Record<string, string> = {
  medical:     'https://images.unsplash.com/photo-1584515933487-779824d29309?w=800&q=75&auto=format&fit=crop',
  education:   'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=75&auto=format&fit=crop',
  disaster:    'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&q=75&auto=format&fit=crop',
  community:   'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=75&auto=format&fit=crop',
  environment: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=800&q=75&auto=format&fit=crop',
  animal:      'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=800&q=75&auto=format&fit=crop',
  sport:       'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=75&auto=format&fit=crop',
  other:       'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=800&q=75&auto=format&fit=crop',
};

interface CampaignCardProps {
  campaign: Campaign;
  className?: string;
}

export function CampaignCard({ campaign, className }: CampaignCardProps) {
  const pct  = getProgress(campaign.raised, campaign.goal);
  const days = daysLeft(campaign.deadline);
  const cat  = CATEGORY_CONFIG[campaign.category];
  const imgSrc = campaign.image_url ?? FALLBACK_IMAGES[campaign.category] ?? FALLBACK_IMAGES.other;

  return (
    <Link
      href={`/campaigns/${campaign.slug}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-900',
        'border border-gray-100 dark:border-gray-800 shadow-card',
        'hover:shadow-card-md hover:-translate-y-1.5 transition-all duration-300',
        className
      )}
    >
      {/* ── Cover image ─────────────────────────────── */}
      <div className="relative h-52 overflow-hidden bg-gray-100 dark:bg-gray-800">
        <Image
          src={imgSrc}
          alt={campaign.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className={cn('badge backdrop-blur-sm', cat.color)}>
            {cat.emoji} {cat.label}
          </span>
          {campaign.is_urgent && (
            <span className="badge bg-red-500 text-white backdrop-blur-sm">
              <Zap className="w-2.5 h-2.5" /> Shoshilinch
            </span>
          )}
        </div>

        {/* Progress % pill */}
        <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-bold">
          {pct}%
        </div>
      </div>

      {/* ── Card body ───────────────────────────────── */}
      <div className="flex flex-col flex-1 p-4">

        {/* Organizer / author row */}
        {campaign.profiles && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400 text-[10px] font-bold flex-shrink-0">
              {(campaign.profiles as { full_name?: string | null }).full_name?.[0]?.toUpperCase() ?? 'X'}
            </div>
            <span className="text-xs text-gray-400 truncate">
              {(campaign.profiles as { full_name?: string | null }).full_name ?? campaign.organizer ?? 'Xayr foydalanuvchisi'}
            </span>
          </div>
        )}

        {/* Title */}
        <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-snug mb-2 line-clamp-2 group-hover:text-brand-600 transition-colors duration-200">
          {campaign.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 flex-1 leading-relaxed">
          {campaign.description}
        </p>

        {/* Progress */}
        <div className="space-y-1.5 mb-3">
          <ProgressBar raised={campaign.raised} goal={campaign.goal} />
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
              {formatMoney(campaign.raised)} so'm
            </span>
            <span className="text-xs text-gray-400">
              {formatMoney(campaign.goal)} so'm maqsad
            </span>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {campaign.donors_count} donor
          </span>
          {days !== null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {days > 0 ? `${days} kun qoldi` : 'Muddati tugagan'}
            </span>
          )}
          {days === null && campaign.location && (
            <span className="truncate max-w-[80px]">📍 {campaign.location}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
