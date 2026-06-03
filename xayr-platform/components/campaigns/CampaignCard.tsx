import Link from 'next/link';
import Image from 'next/image';
import { Clock, Users, Zap } from 'lucide-react';
import { cn, formatMoney, getProgress, daysLeft, CATEGORY_CONFIG } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Campaign } from '@/types';

interface CampaignCardProps {
  campaign: Campaign;
  className?: string;
}

export function CampaignCard({ campaign, className }: CampaignCardProps) {
  const pct = getProgress(campaign.raised, campaign.goal);
  const days = daysLeft(campaign.deadline);
  const cat = CATEGORY_CONFIG[campaign.category];

  return (
    <Link
      href={`/campaigns/${campaign.slug}`}
      className={cn(
        'card group flex flex-col overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        className
      )}
    >
      {/* Image */}
      <div className="relative h-48 bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {campaign.image_url ? (
          <Image
            src={campaign.image_url}
            alt={campaign.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {cat.emoji}
          </div>
        )}
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className={cn('badge', cat.color)}>{cat.emoji} {cat.label}</span>
          {campaign.is_urgent && (
            <span className="badge bg-red-500 text-white">
              <Zap className="w-3 h-3" /> Shoshilinch
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-5">
        <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug mb-2 line-clamp-2 group-hover:text-brand-600 transition-colors">
          {campaign.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 flex-1">
          {campaign.description}
        </p>

        {/* Progress */}
        <div className="space-y-2 mb-4">
          <ProgressBar raised={campaign.raised} goal={campaign.goal} />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-brand-600">{formatMoney(campaign.raised)} so'm</span>
            <span>{pct}%</span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-800">
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
        </div>
      </div>
    </Link>
  );
}
