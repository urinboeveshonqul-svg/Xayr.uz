import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/onesignal';
import { timingSafeEqual } from '@/lib/security/timing-safe';
import type { NotificationType } from '@/types';

export const runtime = 'nodejs';

/**
 * Supabase Database Webhook target — fired on INSERT into public.notifications.
 *
 * Auth: a shared secret sent as the `x-webhook-secret` header (configured on the
 * webhook in the Supabase dashboard). The route reads the recipient's push
 * preferences with the service role and, if enabled, mirrors the notification to
 * a browser push via OneSignal. The notification ROW already exists regardless,
 * so this is purely additive — any failure here leaves the in-app notification
 * intact (the fallback). Always responds 200 so Supabase doesn't retry-storm on
 * a skipped/failed push.
 */

// Map a notification type to the user-toggleable preference category.
type PrefCategory = 'donations' | 'campaign_updates' | 'verification' | 'marketing';

function categoryFor(type: NotificationType): PrefCategory {
  switch (type) {
    case 'donation':
      return 'donations';
    case 'verification':
      return 'verification';
    case 'general':
      return 'marketing';
    case 'campaign_status':
    case 'update':
    case 'comment':
    default:
      return 'campaign_updates';
  }
}

interface WebhookBody {
  type?: string;
  table?: string;
  record?: {
    user_id?: string;
    type?: NotificationType;
    title?: string;
    body?: string | null;
    link?: string | null;
  };
}

export async function POST(request: Request) {
  // ── Auth: constant-time shared-secret check ─────────────────────────────
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured → refuse rather than run unauthenticated.
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  // timingSafeEqual avoids leaking, via response timing, how many leading bytes
  // of a guessed secret are correct (and fails closed on a missing/short header).
  if (!timingSafeEqual(request.headers.get('x-webhook-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as WebhookBody | null;

  // Only react to notification inserts; acknowledge everything else.
  if (!body || body.type !== 'INSERT' || body.table !== 'notifications' || !body.record?.user_id) {
    return NextResponse.json({ skipped: 'irrelevant' });
  }

  const record = body.record;
  const userId = record.user_id!;
  const category = categoryFor(record.type ?? 'general');

  try {
    const admin = createAdminClient();

    // Preferences gate. No row → user never opted in → no push (in-app only).
    const { data: prefs } = await admin
      .from('notification_preferences')
      .select('push_enabled, donations, campaign_updates, verification, marketing')
      .eq('user_id', userId)
      .maybeSingle();

    if (!prefs || !prefs.push_enabled || !prefs[category]) {
      return NextResponse.json({ skipped: 'preference_off' });
    }

    // Build an absolute, locale-prefixed click URL from the stored link.
    let url: string | undefined;
    if (record.link) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
      const { data: u } = await admin
        .from('users')
        .select('preferred_language')
        .eq('id', userId)
        .maybeSingle();
      const lang = u?.preferred_language || 'uz';
      url = appUrl ? `${appUrl}/${lang}${record.link}` : undefined;
    }

    const result = await sendPushToUser({
      userId,
      title: record.title || 'Xayr',
      body: record.body || '',
      url,
    });

    return NextResponse.json({ ok: true, sent: result.sent, reason: result.reason });
  } catch (err) {
    // Never fail the webhook — the in-app notification already exists.
    console.error('[push/notify] error:', err);
    return NextResponse.json({ ok: true, sent: false, reason: 'exception' });
  }
}
