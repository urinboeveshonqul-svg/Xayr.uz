'use client';

import { useEffect, useState, type ComponentType } from 'react';
import toast from 'react-hot-toast';
import { X, Send, Facebook, Link2, MessageCircle, Mail, Instagram, QrCode, Loader2 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import {
  trackShare,
  shareLinks,
  generateQrPng,
  downloadDataUrl,
  type ShareSource,
} from '@/lib/share';

/**
 * Share sheet — one tap per channel, plus the campaign URL with a copy action.
 * Used as the primary share entry on desktop and as the Web Share API fallback
 * on devices without it. Every channel records a campaign_shares row for owner
 * analytics (migration #49 covers the newer sources).
 *
 * Adding a platform later = one entry in `channels` below. Each channel is
 * either a `href` (opened in a new tab) or an `action` (async side effect), so
 * link-based and non-link platforms coexist without a redesign.
 */

type Channel = {
  key: ShareSource;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  cls: string;
} & ({ href: string; action?: never } | { action: () => void | Promise<void>; href?: never });

export function ShareModal({
  campaignId,
  title,
  description,
  imageUrl,
  url,
  onClose,
}: {
  campaignId: string;
  title: string;
  /** Short campaign description — shared alongside the title + URL. */
  description?: string | null;
  imageUrl: string | null;
  url: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const links = shareLinks({ url, title, description });
  const [qrBusy, setQrBusy] = useState(false);

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

  // Instagram has no web share endpoint for arbitrary links, so the honest
  // behaviour is to hand the donor the link to paste into a story/bio.
  const shareInstagram = async () => {
    try {
      await navigator.clipboard.writeText(url);
      trackShare(campaignId, 'instagram');
      toast.success(t('share.instagramCopied'));
    } catch {
      /* clipboard unavailable */
    }
  };

  const downloadQr = async () => {
    if (qrBusy) return;
    setQrBusy(true);
    try {
      const png = await generateQrPng(url);
      downloadDataUrl(png, `xayr-campaign-qr.png`);
      trackShare(campaignId, 'qr');
      toast.success(t('share.qrDownloaded'));
    } catch {
      toast.error(t('share.qrFailed'));
    } finally {
      setQrBusy(false);
    }
  };

  // Telegram first — the dominant channel in Uzbekistan.
  const channels: Channel[] = [
    { key: 'telegram', label: 'Telegram', href: links.telegram, Icon: Send, cls: 'bg-sky-50 text-sky-500 dark:bg-sky-900/20' },
    { key: 'whatsapp', label: 'WhatsApp', href: links.whatsapp, Icon: MessageCircle, cls: 'bg-green-50 text-green-600 dark:bg-green-900/20' },
    { key: 'facebook', label: 'Facebook', href: links.facebook, Icon: Facebook, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' },
    { key: 'instagram', label: 'Instagram', action: shareInstagram, Icon: Instagram, cls: 'bg-pink-50 text-pink-600 dark:bg-pink-900/20' },
    { key: 'email', label: t('share.srcEmail'), href: links.email, Icon: Mail, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
    { key: 'qr', label: t('share.qrLabel'), action: downloadQr, Icon: QrCode, cls: 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-pop overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="share-modal-title" className="text-base font-bold text-gray-900 dark:text-white">
            {t('share.title')}
          </h2>
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
        <div className="grid grid-cols-3 gap-2 px-5 py-4">
          {channels.map(({ key, label, href, action, Icon, cls }) => (
            <button
              key={key}
              onClick={() => (href ? openChannel(href, key) : action?.())}
              disabled={key === 'qr' && qrBusy}
              className="flex flex-col items-center gap-1.5 py-3 min-h-[80px] rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${cls}`}>
                {key === 'qr' && qrBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </span>
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300 text-center leading-tight">
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* Campaign URL + copy */}
        <div className="px-5 pb-5">
          <button
            onClick={copy}
            className="w-full flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
