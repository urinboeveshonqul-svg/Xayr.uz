'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Send, Facebook, Link2, MessageCircle } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { trackShare, shareLinks, type ShareSource } from '@/lib/share';

/**
 * Modern share modal — campaign image + title, one tap per channel. Used as the
 * primary share entry on desktop and as the Web Share API fallback on devices
 * without it. Every channel records a campaign_shares row for owner analytics.
 */
export function ShareModal({
  campaignId,
  title,
  imageUrl,
  url,
  onClose,
}: {
  campaignId: string;
  title: string;
  imageUrl: string | null;
  url: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const links = shareLinks(url, title);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openChannel = (href: string, source: ShareSource) => {
    trackShare(campaignId, source);
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      trackShare(campaignId, 'copy_link');
      toast.success(t('ux.linkCopied'));
      onClose();
    } catch {
      /* clipboard unavailable */
    }
  };

  const channels: { key: ShareSource; label: string; href?: string; Icon: typeof Send; cls: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', href: links.whatsapp, Icon: MessageCircle, cls: 'bg-green-50 text-green-600 dark:bg-green-900/20' },
    { key: 'telegram', label: 'Telegram', href: links.telegram, Icon: Send, cls: 'bg-blue-50 text-blue-500 dark:bg-blue-900/20' },
    { key: 'facebook', label: 'Facebook', href: links.facebook, Icon: Facebook, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' },
    { key: 'x', label: 'X', href: links.x, Icon: XLogo, cls: 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white' },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-pop overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{t('share.title')}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('ux.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Campaign preview */}
        <div className="px-5 flex items-center gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex-shrink-0" />
          )}
          <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{title}</p>
        </div>

        <p className="px-5 mt-3 text-xs text-gray-400">{t('share.subtitle')}</p>

        {/* Channels */}
        <div className="grid grid-cols-4 gap-2 px-5 py-4">
          {channels.map(({ key, label, href, Icon, cls }) => (
            <button
              key={key}
              onClick={() => href && openChannel(href, key)}
              className="flex flex-col items-center gap-1.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${cls}`}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">{label}</span>
            </button>
          ))}
        </div>

        {/* Copy link */}
        <div className="px-5 pb-5">
          <button
            onClick={copy}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Link2 className="w-4 h-4 flex-shrink-0" />
            <span className="truncate flex-1 text-left text-gray-500 dark:text-gray-400 font-normal">{url}</span>
            <span className="text-brand-600 flex-shrink-0">{t('ux.copyLink')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// X (Twitter) glyph — lucide has no X-brand icon, so inline the official mark.
function XLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
