# Browser Push Notifications (OneSignal) — Setup

Push is layered on top of the existing in-app notification system. Every event
already writes a row to `public.notifications`; a Supabase **Database Webhook**
calls `/api/push/notify` on each insert, which sends a OneSignal push **if** the
recipient opted in. If push fails for any reason, the in-app notification still
exists — push is purely additive.

Until the steps below are done, the app runs exactly as before (every piece
no-ops when its env vars are missing).

## 1. OneSignal dashboard
1. Create an app at <https://dashboard.onesignal.com> → **Web** platform.
2. Site URL: `https://xayr.uz` (and your Vercel preview domain if you want push there).
3. Default notification icon/title optional.
4. Copy the **App ID** and the **REST API Key** (Settings → Keys & IDs).

> The SDK service worker is already served at `/OneSignalSDKWorker.js`
> (`public/OneSignalSDKWorker.js`) — no upload needed. Use the **default** path
> setting in OneSignal.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)
```
NEXT_PUBLIC_ONESIGNAL_APP_ID = <App ID>        # public, used by the browser SDK
ONESIGNAL_REST_API_KEY       = <REST API Key>  # SECRET — server only
SUPABASE_WEBHOOK_SECRET      = <long random>   # SECRET — shared with the webhook
```
Generate the webhook secret with e.g. `openssl rand -hex 32`.

## 3. Database migration
Run `supabase/push-notifications.sql` in the Supabase SQL Editor (runbook step #29).
This creates `notification_preferences` (per-user opt-in + category toggles).

## 4. Supabase Database Webhook
Supabase Dashboard → **Database → Webhooks → Create a new hook**:
- **Table:** `public.notifications`
- **Events:** `INSERT`
- **Type:** HTTP Request → `POST`
- **URL:** `https://xayr.uz/api/push/notify`
- **HTTP Headers:** add `x-webhook-secret` = the same value as `SUPABASE_WEBHOOK_SECRET`

## How it maps
| notification type | preference category |
|---|---|
| `donation` | Donations |
| `campaign_status`, `update`, `comment` | Campaign updates (incl. withdrawals) |
| `verification` | Verification |
| `general` | Marketing (opt-in) |

`push_enabled` defaults **false** — no push is sent until the user enables it in
**Profile → Push notifications** (which also requests browser permission and
subscribes the device via OneSignal). External ID = the Supabase user id, so the
server targets users without storing device ids.

## Mobile / PWA
Browser push works on **Android Chrome** and **installed PWAs** out of the box
via the root service worker. iOS Safari only delivers web push to PWAs added to
the Home Screen (iOS 16.4+); a regular Safari tab won't receive push — that's an
Apple platform limitation, not a config issue.

## Verifying
1. Set the env vars + run the migration + create the webhook.
2. Log in, open Profile, enable **Push notifications**, accept the browser prompt.
3. Trigger an event (e.g. donate to your campaign). You should get both the
   in-app bell notification and a browser push.
4. If only the in-app one arrives, check the webhook's recent deliveries in
   Supabase and the `/api/push/notify` logs in Vercel.
