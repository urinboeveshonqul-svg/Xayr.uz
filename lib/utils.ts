import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  type LucideIcon,
  HeartPulse, GraduationCap, Siren, HeartHandshake, Leaf, PawPrint, Trophy, Lightbulb,
} from 'lucide-react';
import type { CampaignCategory } from '@/types';

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

/** Category display config. `Icon` is a Lucide component (replaces the old emoji). */
export const CATEGORY_CONFIG: Record<
  CampaignCategory,
  { label: string; Icon: LucideIcon; color: string; bg: string }
> = {
  medical:     { label: 'Tibbiyot',      Icon: HeartPulse,     color: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',    bg: '#fee2e2' },
  education:   { label: 'Ta\'lim',       Icon: GraduationCap,  color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',  bg: '#dbeafe' },
  disaster:    { label: 'Favqulodda',    Icon: Siren,          color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400', bg: '#ffedd5' },
  community:   { label: 'Jamiyat',       Icon: HeartHandshake, color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',  bg: '#dcfce7' },
  environment: { label: 'Ekologiya',     Icon: Leaf,           color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400', bg: '#d1fae5' },
  animal:      { label: 'Hayvonlar',     Icon: PawPrint,       color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400', bg: '#fef9c3' },
  sport:       { label: 'Sport',         Icon: Trophy,         color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', bg: '#ede9fe' },
  other:       { label: 'Boshqa',        Icon: Lightbulb,      color: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400',    bg: '#f3f4f6' },
};

export const STATUS_CONFIG = {
  pending:   { label: 'Kutilmoqda',   color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  active:    { label: 'Faol',         color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  rejected:  { label: 'Rad etilgan',  color: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  completed: { label: 'Yakunlangan',  color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  paused:    { label: 'To\'xtatilgan',color: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  expired:   { label: 'Muddati tugagan',   color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
  funded:    { label: 'Moliyalashtirilgan', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  cancelled: { label: 'Bekor qilingan',    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
} as const;

/** Archived/terminal statuses — the campaign is no longer collecting donations. */
export const ENDED_STATUSES = ['expired', 'funded', 'completed', 'cancelled'] as const;

/**
 * True when a campaign can no longer accept donations — either it is in an
 * archived/terminal status, or its deadline has passed (even if the nightly
 * expire sweep hasn't flipped the status yet). Used to gate the donate UI.
 */
export function isCampaignEnded(status: string, deadline: string | null): boolean {
  if ((ENDED_STATUSES as readonly string[]).includes(status)) return true;
  if (deadline && new Date(deadline).getTime() < Date.now()) return true;
  return false;
}

/** True when the campaign reached (or exceeded) its goal. */
export function isGoalReached(raised: number, goal: number): boolean {
  return goal > 0 && raised >= goal;
}
