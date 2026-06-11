'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getRecentIds } from '@/lib/recently-viewed';
import type { Campaign } from '@/types';

/**
 * Per-user "Recently Viewed" section. Logged-in users read history from the DB;
 * guests read it from localStorage. Always a CLIENT component so it never leaks
 * personalized data into the cached homepage. Reuses CampaignCard. Hides when
 * empty. `compact` renders an inline 2-col variant (for the narrow profile page).
 */
export function RecentlyViewed({
  title,
  limit = 8,
  compact = false,
}: {
  /** Optional override; defaults to the localized section title. */
  title?: string;
  limit?: number;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const heading = title ?? t('ux.recentTitle');
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      let ids: string[] = [];
      if (user) {
        const { data } = await supabase
          .from('recently_viewed')
          .select('campaign_id, viewed_at')
          .eq('user_id', user.id)
          .order('viewed_at', { ascending: false })
          .limit(limit);
        ids = (data ?? []).map((r) => r.campaign_id);
      } else {
        ids = getRecentIds().slice(0, limit);
      }

      if (ids.length === 0) {
        if (active) setCampaigns([]);
        return;
      }

      // Single query for all campaigns (no N+1); re-order to match recency.
      const { data: camps } = await supabase
        .from('campaigns')
        .select('*, profiles:users(full_name, avatar_url), categories(slug)')
        .in('id', ids);
      const list = (camps as unknown as Campaign[]) ?? [];
      const byId = new Map(list.map((c) => [c.id, c]));
      const ordered = ids.map((id) => byId.get(id)).filter((c): c is Campaign => !!c);

      if (active) setCampaigns(ordered);
    })();
    return () => { active = false; };
  }, [limit]);

  if (!campaigns || campaigns.length === 0) return null;

  if (compact) {
    return (
      <div className="mt-6">
        <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
          {heading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      </div>
    );
  }

  return (
    <section className="py-12 lg:py-16 bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white mb-6">{heading}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      </div>
    </section>
  );
}
