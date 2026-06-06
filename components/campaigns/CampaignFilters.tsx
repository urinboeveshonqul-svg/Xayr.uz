'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { CATEGORY_CONFIG } from '@/lib/utils';
import type { CampaignCategory } from '@/types';

const SORTS = ['newest', 'most_raised', 'most_donors', 'deadline'] as const;

export function CampaignFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get('category') ?? 'all';
  const sort = searchParams.get('sort') ?? 'newest';
  const urgent = searchParams.get('urgent') === '1';
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  // Apply a mutation to the URL params, always resetting to page 1.
  const update = (mut: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mut(params);
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update((p) => {
      const v = search.trim();
      if (v) p.set('q', v);
      else p.delete('q');
    });
  };

  const setCategory = (cat: string) =>
    update((p) => (cat === 'all' ? p.delete('category') : p.set('category', cat)));

  const setSort = (s: string) =>
    update((p) => (s === 'newest' ? p.delete('sort') : p.set('sort', s)));

  const toggleUrgent = (on: boolean) =>
    update((p) => (on ? p.set('urgent', '1') : p.delete('urgent')));

  const hasFilters =
    category !== 'all' || urgent || !!searchParams.get('q') || sort !== 'newest';

  const clearAll = () => {
    setSearch('');
    router.push(pathname);
  };

  const sortLabel: Record<(typeof SORTS)[number], string> = {
    newest: t('filters.sortNewest'),
    most_raised: t('filters.sortMostRaised'),
    most_donors: t('filters.sortMostDonors'),
    deadline: t('filters.sortDeadline'),
  };

  return (
    <div className="card p-4 mb-8 space-y-4">
      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={onSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="input pl-9"
            aria-label={t('filters.searchPlaceholder')}
          />
        </form>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="input sm:w-48"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {sortLabel[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('all')}
          className={`badge cursor-pointer transition-all ${
            category === 'all'
              ? 'bg-brand-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {t('filters.all')}
        </button>
        {(Object.keys(CATEGORY_CONFIG) as CampaignCategory[]).map((cat) => {
          const CatIcon = CATEGORY_CONFIG[cat].Icon;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`badge cursor-pointer transition-all ${
                category === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <CatIcon className="w-3.5 h-3.5" /> {t(`categories.${cat}`)}
            </button>
          );
        })}
      </div>

      {/* Urgent + clear */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => toggleUrgent(e.target.checked)}
            className="w-4 h-4 accent-brand-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
            {t('filters.urgentOnly')}
          </span>
        </label>
        {hasFilters && (
          <button onClick={clearAll} className="btn-ghost text-xs gap-1">
            <X className="w-3.5 h-3.5" />
            {t('filters.clear')}
          </button>
        )}
      </div>
    </div>
  );
}
