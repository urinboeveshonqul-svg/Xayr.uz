/**
 * OneSignal REST sender (server-only).
 *
 * Targets users by EXTERNAL ID (= the Supabase user id, set client-side via
 * OneSignal.login()), so we never store device/player ids ourselves. The REST
 * API key is read from a server-only env var and must NEVER be exposed to the
 * browser.
 *
 * Designed to fail soft: if OneSignal isn't configured (env vars absent) or the
 * API call errors, it returns { sent: false } instead of throwing. Push is an
 * enhancement layered on top of the durable in-app notification row, so a push
 * failure must never break the request that created the notification.
 */

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

// App id may be provided as the public var (preferred — same value the browser
// SDK uses) or a server-only alias.
const APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || process.env.ONESIGNAL_APP_ID || '';
const REST_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

export function isPushConfigured(): boolean {
  return Boolean(APP_ID && REST_KEY);
}

export interface PushMessage {
  /** Supabase user id — used as the OneSignal external id. */
  userId: string;
  title: string;
  body: string;
  /** Absolute URL to open on click (already locale-prefixed). */
  url?: string;
}

export async function sendPushToUser(msg: PushMessage): Promise<{ sent: boolean; reason?: string }> {
  if (!isPushConfigured()) return { sent: false, reason: 'not_configured' };

  try {
    const payload: Record<string, unknown> = {
      app_id: APP_ID,
      target_channel: 'push',
      include_aliases: { external_id: [msg.userId] },
      headings: { en: msg.title },
      contents: { en: msg.body },
    };
    if (msg.url) payload.url = msg.url;

    const res = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${REST_KEY}`,
      },
      body: JSON.stringify(payload),
      // Never let a slow OneSignal call hang the webhook response.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { sent: false, reason: `http_${res.status}:${text.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}
