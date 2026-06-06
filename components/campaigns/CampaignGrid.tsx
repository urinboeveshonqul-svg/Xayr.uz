import { CampaignCard } from './CampaignCard';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import type { Campaign } from '@/types';

interface CampaignGridProps {
  campaigns: Campaign[];
  emptyMessage?: string;
}

export function CampaignGrid({ campaigns, emptyMessage }: CampaignGridProps) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="flex justify-center mb-4">
          <Heart className="w-14 h-14 text-green-500 fill-green-500" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {emptyMessage ?? 'Hozircha kampaniyalar yo\'q'}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Birinchi bo'lib kampaniya yarating va o'zgarish yarating.
        </p>
        <Link href="/campaigns/create" className="btn-primary">
          <Heart className="w-4 h-4" />
          Kampaniya yaratish
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}
