/**
 * Browser-side OneSignal helpers (v16). Used by OneSignalProvider (init/login)
 * and PushSettings (opt in/out). All calls are queued through OneSignalDeferred
 * so they run only once the SDK has loaded; every call is best-effort and never
 * throws into the UI.
 */

export type OneSignalApi = {
  init: (opts: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<void>;
  };
  Slidedown: { promptPush: (opts?: Record<string, unknown>) => Promise<void> };
  User: { PushSubscription: { optIn: () => Promise<void>; optOut: () => Promise<void> } };
};

export function withOneSignal(cb: (os: OneSignalApi) => void | Promise<void>) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { OneSignalDeferred?: Array<(os: OneSignalApi) => void> };
  w.OneSignalDeferred = w.OneSignalDeferred || [];
  w.OneSignalDeferred.push(cb);
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID);
}

/** Request browser permission and subscribe this device. */
export function optInPush() {
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.Notifications.requestPermission();
      await OneSignal.User.PushSubscription.optIn();
    } catch {
      /* denied / unsupported — DB preference still reflects intent */
    }
  });
}

/** Unsubscribe this device (keeps in-app notifications). */
export function optOutPush() {
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.User.PushSubscription.optOut();
    } catch {
      /* no-op */
    }
  });
}
