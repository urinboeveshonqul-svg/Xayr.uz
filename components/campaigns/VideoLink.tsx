'use client';

import { ExternalLink } from 'lucide-react';
import { parseVideoUrl, type VideoProviderId } from '@/lib/video';
import { useI18n } from '@/components/i18n/I18nProvider';

// Provider → "opens in <provider>" caption key. The primary button text stays
// provider-neutral; only this caption names the provider, so adding a provider is
// a one-line change here (plus its parser in lib/video).
const CAPTION_KEY: Record<VideoProviderId, string> = {
  instagram: 'video.opensInInstagram',
};

/**
 * Renders a campaign's optional video as an external link (opens in a new tab) —
 * no iframe, no embed script. Renders NOTHING when there is no video or the
 * stored URL is not a recognized provider link (no empty placeholder). The href
 * is the canonical permalink from lib/video, so it is always a validated,
 * fixed-shape provider URL. The button label is provider-neutral; a small caption
 * names where it opens.
 */
export function VideoLink({ url }: { url: string | null | undefined }) {
  const { t } = useI18n();
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('video.sectionTitle')}</h2>
      <a
        href={parsed.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2"
      >
        ▶ {t('video.watchButton')}
        <ExternalLink className="w-4 h-4" />
      </a>
      <p className="text-xs text-gray-400 mt-2">{t(CAPTION_KEY[parsed.provider])}</p>
    </div>
  );
}
