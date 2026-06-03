import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format number as UZS currency */
export function formatMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} mlrd`;
  if (amount >= 1_000_000)     return `${(amount / 1_000_000).toFixed(1)} mln`;
  if (amount >= 1_000)         return `${(amount / 1_000).toFixed(0)} ming`;
  return amount.toLocaleString('uz-UZ');
}

/** Full UZS format */
export function formatMoneyFull(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' so\'m';
}

/** Progress percentage capped at 100 */
export function getProgress(raised: number, goal: number): number {
  if (!goal) return 0;
  return Math.min(100, Math.round((raised / goal) * 100));
}

/** Days remaining from deadline */
export function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Relative time string */
export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)   return 'Hozirgina';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} daqiqa oldin`;
  if (seconds < 86400)return `${Math.floor(seconds / 3600)} soat oldin`;
  return `${Math.floor(seconds / 86400)} kun oldin`;
}

/** Generate URL-safe slug */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Category display config */
export const CATEGORY_CONFIG = {
  medical:     { label: 'Tibbiyot',      emoji: '🏥', color: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',    bg: '#fee2e2' },
  education:   { label: 'Ta\'lim',       emoji: '📚', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',  bg: '#dbeafe' },
  disaster:    { label: 'Favqulodda',    emoji: '🆘', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400', bg: '#ffedd5' },
  community:   { label: 'Jamiyat',       emoji: '🤝', color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',  bg: '#dcfce7' },
  environment: { label: 'Ekologiya',     emoji: '🌱', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400', bg: '#d1fae5' },
  animal:      { label: 'Hayvonlar',     emoji: '🐾', color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400', bg: '#fef9c3' },
  sport:       { label: 'Sport',         emoji: '⚽', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', bg: '#ede9fe' },
  other:       { label: 'Boshqa',        emoji: '💡', color: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400',    bg: '#f3f4f6' },
} as const;

export const STATUS_CONFIG = {
  pending:   { label: 'Kutilmoqda',   color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  active:    { label: 'Faol',         color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  rejected:  { label: 'Rad etilgan',  color: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  completed: { label: 'Yakunlangan',  color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  paused:    { label: 'To\'xtatilgan',color: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
} as const;
