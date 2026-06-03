// Central i18n configuration for Xayr.
export const locales = ['uz', 'ru', 'en'] as const;
export type Locale = (typeof locales)[number];

// Uzbek is the default language.
export const defaultLocale: Locale = 'uz';

export const localeNames: Record<Locale, string> = {
  uz: "O'zbekcha",
  ru: 'Русский',
  en: 'English',
};

export const localeLabels: Record<Locale, string> = {
  uz: 'UZ',
  ru: 'RU',
  en: 'EN',
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
