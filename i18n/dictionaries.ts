import type { Locale } from './config';

// Lazily import the message catalog for a locale (server-side only).
const dictionaries = {
  uz: () => import('@/locales/uz/common.json').then((m) => m.default),
  ru: () => import('@/locales/ru/common.json').then((m) => m.default),
  en: () => import('@/locales/en/common.json').then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)['uz']>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return (dictionaries[locale] ?? dictionaries.uz)();
}
