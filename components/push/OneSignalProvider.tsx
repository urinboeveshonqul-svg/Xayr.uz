'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { withOneSignal } from '@/lib/push-client';

/**
 * Loads + initializes the OneSignal Web SDK (v16) once, app-wide.
 *
 * - App id is the only OneSignal value on the client (public by design); the
 *   REST key lives server-side only. If the app id is absent the whole thing
 *   no-ops, so the site runs unchanged until OneSignal is configured.
 * - Identifies the signed-in user to OneSignal by EXTERNAL ID (= Supabase user
 *   id) so the push webhook can target them without us storing device ids.
 * - Asks for permission AFTER login (once), via the soft slidedown — never an
 *   unprompted native popup on first page load.
 *
 * Renders nothing.
 */

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';
const SDK_SRC = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
const PROMPTED_KEY = 'xayr_push_prompted';

export function OneSignalProvider() {
  useEffect(() => {
    if (!APP_ID) return; // not configured → no-op

    // Inject the SDK script once.
    if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = SDK_SRC;
      s.defer = true;
      document.head.appendChild(s);
    }

    // Initialize once (guard against React strict-mode double-invoke).
    const w = window as unknown as { __xayrOneSignalInit?: boolean };
    if (!w.__xayrOneSignalInit) {
      w.__xayrOneSignalInit = true;
      withOneSignal(async (OneSignal) => {
        await OneSignal.init({
          appId: APP_ID,
          allowLocalhostAsSecureOrigin: true,
        });
      });
    }

    const supabase = createClient();

    // Identify (or clear) the user on the OneSignal side and prompt once.
    const sync = (userId: string | null) => {
      withOneSignal(async (OneSignal) => {
        try {
          if (userId) {
            await OneSignal.login(userId);
            // Ask for permission once per browser, only after we have a user.
            if (!OneSignal.Notifications.permission && !localStorage.getItem(PROMPTED_KEY)) {
              localStorage.setItem(PROMPTED_KEY, '1');
              await OneSignal.Slidedown.promptPush();
            }
          } else {
            await OneSignal.logout();
          }
        } catch {
          /* push is best-effort — never surface errors to the user */
        }
      });
    };

    supabase.auth.getSession().then(({ data }) => sync(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      sync(session?.user?.id ?? null)
    );

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
