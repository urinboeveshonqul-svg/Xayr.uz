'use client';

import { createContext, useContext, useCallback } from 'react';
import type { Locale } from '@/i18n/config';

type Messages = Record<string, unknown>;

interface I18nValue {
  locale: Locale;
  messages: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, messages }}>
      {children}
    </I18nContext.Provider>
  );
}

function lookup(messages: Messages, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>(
    (acc, part) =>
      acc && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[part]
        : undefined,
    messages
  );
  return typeof value === 'string' ? value : undefined;
}

/**
 * Client-side translation hook.
 *   const { t, locale } = useI18n();
 *   t('home.heroTitle')
 *   t('campaign.daysLeft', { count: 5 })
 */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');

  const { messages, locale } = ctx;

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = lookup(messages, key);
      if (str === undefined) return key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    },
    [messages]
  );

  return { t, locale };
}
