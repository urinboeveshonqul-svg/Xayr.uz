'use client';

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { CampaignGrid } from './CampaignGrid';
import { CATEGORY_CONFIG } from '@/lib/utils';
import type { Campaign, CampaignCategory } from '@/types';

interface CampaignsPageClientProps {
  initialCampaigns: Campaign[];
}

type SortOption = 'newest' | 'most_raised' | 'most_donors' | 'deadline';

export function CampaignsPageClient({ initialCampaigns }: CampaignsPageClientProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CampaignCategory | 'all'>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [urgentOnly, setUrgentOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = [...initialCampaigns];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.location?.toLowerCase().includes(q)
      );
    }

    if (category !== 'all') {
      list = list.filter((c) => c.category === category);
    }

    if (urgentOnly) {
      list = list.filter((c) => c.is_urgent);
    }

    switch (sort) {
      case 'most_raised':
        list.sort((a, b) => b.raised - a.raised);
        break;
      case 'most_donors':
        list.sort((a, b) => b.donors_count - a.donors_count);
        break;
      case 'deadline':
        list.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
        break;
      default:
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return list;
  }, [initialCampaigns, search, category, sort, urgentOnly]);

  const hasFilters = search || category !== 'all' || urgentOnly;

  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setUrgentOnly(false);
    setSort('newest');
  };

  return (
    <div>
      {/* Filters */}
      <div className="card p-4 mb-8 space-y-4">
        {/* Search + Sort row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Kampaniya qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="input sm:w-48"
          >
            <option value="newest">Eng yangi</option>
            <option value="most_raised">Ko'p to'plangan</option>
            <option value="most_donors">Ko'p donorlar</option>
            <option value="deadline">Muddati yaqin</option>
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
            Barchasi
          </button>
          {(Object.keys(CATEGORY_CONFIG) as CampaignCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`badge cursor-pointer transition-all ${
                category === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}
            </button>
          ))}
        </div>

        {/* Urgent + clear */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={urgentOnly}
              onChange={(e) => setUrgentOnly(e.target.checked)}
              className="w-4 h-4 accent-brand-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
              Faqat shoshilinch
            </span>
          </label>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost text-xs gap-1">
              <X className="w-3.5 h-3.5" />
              Tozalash
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {filtered.length} ta kampaniya topildi
      </p>

      <CampaignGrid campaigns={filtered} />
    </div>
  );
}
