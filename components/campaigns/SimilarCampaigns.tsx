'use client';

import { CampaignCard } from './CampaignCard';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { Campaign } from '@/types';

export function SimilarCampaigns({ campaigns }: { campaigns: Campaign[] }) {
  const { t } = useI18n();
  if (!campaigns.length) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        {t('detail.similarTitle')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} />
        ))}
      </div>
    </section>
  );
}
