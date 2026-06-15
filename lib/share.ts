import { createClient } from '@/lib/supabase/client';

export type ShareSource =
  | 'whatsapp'
  | 'telegram'
  | 'facebook'
  | 'x'
  | 'copy_link'
  | 'native'
  | 'other';

/**
 * Record a share, fire-and-forget. Sharing must feel instant, so we never await
 * this or surface errors — the row is best-effort analytics, not part of the UX.
 * INSERT is open to anon + authenticated (see campaign-shares.sql), so logged-out
 * visitors are counted too.
 */
export function trackShare(campaignId: string, source: ShareSource): void {
  try {
    void createClient()
      .from('campaign_shares')
      .insert({ campaign_id: campaignId, source })
      .then(
        () => {},
        () => {}
      );
  } catch {
    /* ignore — analytics must never break sharing */
  }
}

/** Build the per-channel share URLs from a campaign URL + title. */
export function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
  };
}
