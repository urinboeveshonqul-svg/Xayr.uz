'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { optInPush, optOutPush, pushConfigured } from '@/lib/push-client';
import type { NotificationPreferences } from '@/types';

type Prefs = Pick<
  NotificationPreferences,
  'push_enabled' | 'donations' | 'campaign_updates' | 'verification' | 'marketing'
>;

const DEFAULTS: Prefs = {
  push_enabled: false,
  donations: true,
  campaign_updates: true,
  verification: true,
  marketing: false,
};

/**
 * Profile push-notification settings. Writes to notification_preferences under
 * the user's own RLS policy; the push webhook reads the same row to decide what
 * to deliver. The master toggle also drives the OneSignal browser subscription
 * (opt in/out). Hidden entirely when OneSignal isn't configured.
 */
export function PushSettings({
  userId,
  initial,
}: {
  userId: string;
  initial: Prefs | null;
}) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<Prefs>(initial ?? DEFAULTS);
  const [busy, setBusy] = useState(false);

  if (!pushConfigured()) return null;

  // Persist a patch (optimistic). Reverts + toasts on failure.
  const save = async (patch: Partial<Prefs>) => {
    const prev = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setBusy(true);
    try {
      const { error } = await createClient()
        .from('notification_preferences')
        .upsert({ user_id: userId, ...next }, { onConflict: 'user_id' });
      if (error) {
        setPrefs(prev);
        toast.error(t('push.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleMaster = async () => {
    const enabling = !prefs.push_enabled;
    if (enabling) optInPush();
    else optOutPush();
    await save({ push_enabled: enabling });
    toast.success(enabling ? t('push.enabledToast') : t('push.disabledToast'));
  };

  const categories: { key: keyof Prefs; label: string }[] = [
    { key: 'donations', label: t('push.donations') },
    { key: 'campaign_updates', label: t('push.campaignUpdates') },
    { key: 'verification', label: t('push.verification') },
    { key: 'marketing', label: t('push.marketing') },
  ];

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-brand-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('push.title')}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('push.subtitle')}</p>
          </div>
        </div>
        <Switch on={prefs.push_enabled} busy={busy} onClick={toggleMaster} />
      </div>

      {/* Category toggles — only relevant once push is enabled. */}
      {prefs.push_enabled && (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
          {categories.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              <Switch
                on={Boolean(prefs[key])}
                busy={busy}
                onClick={() => save({ [key]: !prefs[key] } as Partial<Prefs>)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Switch({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      role="switch"
      aria-checked={on}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        on ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'
      }`}
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin text-white absolute left-1/2 -translate-x-1/2" />
      ) : (
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            on ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      )}
    </button>
  );
}
