import { createClient } from '@/lib/supabase/client';

/**
 * Share channels.
 *
 * 'x' is RETIRED from the UI but kept in the type: historical campaign_shares
 * rows still hold it and get_share_stats keeps reporting them (see migration
 * #49). 'native' is the device share sheet; 'other' is a catch-all.
 */
export type ShareSource =
  | 'telegram'
  | 'whatsapp'
  | 'facebook'
  | 'instagram'
  | 'email'
  | 'qr'
  | 'copy_link'
  | 'native'
  | 'other'
  | 'x';

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

/** Keep shared blurbs short so previews/messages stay readable. */
export function shortDescription(description: string | null | undefined, max = 160): string {
  const d = (description ?? '').trim().replace(/\s+/g, ' ');
  if (!d) return '';
  return d.length <= max ? d : `${d.slice(0, max - 1).trimEnd()}…`;
}

export interface ShareContent {
  url: string;
  title: string;
  /** Short campaign description — included in the shared message where supported. */
  description?: string | null;
}

/**
 * Build the per-channel share URLs. Telegram, WhatsApp and Email carry the
 * title + short description + URL.
 *
 * Facebook intentionally receives only `u=`: Facebook dropped support for
 * prefilled text (the `quote` param is ignored), and composes its preview from
 * the page's Open Graph tags — which every campaign page already emits.
 */
export function shareLinks({ url, title, description }: ShareContent) {
  const blurb = shortDescription(description);
  const u = encodeURIComponent(url);
  // Title + blurb + link, as one readable message.
  const message = [title, blurb].filter(Boolean).join('\n\n');

  return {
    telegram: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(message)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${message}\n\n${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${message}\n\n${url}`)}`,
  };
}

/**
 * Build a QR code for a campaign URL as a PNG data URL. The `qrcode` library is
 * imported dynamically so it never lands in the campaign page's initial bundle —
 * it loads only when a user actually opens the share sheet's QR action.
 */
export async function generateQrPng(url: string): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(url, {
    width: 1024, // large enough to print/scan reliably
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#FFFFFF' },
  });
}

/** Trigger a browser download of a data URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
