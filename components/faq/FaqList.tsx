'use client';

import { useMemo, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export interface FaqItem {
  cat: string;
  q: string;
  a: string;
}

/**
 * Searchable, category-filtered FAQ. Accordions are native <details> elements —
 * accessible and mobile-friendly with zero per-item state.
 */
export function FaqList({
  items,
  categories,
  allLabel,
  searchPlaceholder,
  noResults,
}: {
  items: FaqItem[];
  categories: Record<string, string>;
  allLabel: string;
  searchPlaceholder: string;
  noResults: string;
}) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        (cat === 'all' || it.cat === cat) &&
        (!q || it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q))
    );
  }, [items, query, cat]);

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="input pl-11"
          aria-label={searchPlaceholder}
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setCat('all')}
          className={`badge cursor-pointer transition-all ${
            cat === 'all'
              ? 'bg-brand-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {allLabel}
        </button>
        {Object.entries(categories).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCat(key)}
            className={`badge cursor-pointer transition-all ${
              cat === key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Accordions */}
      {visible.length === 0 ? (
        <p className="text-center text-gray-400 py-10">{noResults}</p>
      ) : (
        <div className="space-y-2">
          {visible.map((it, i) => (
            <details key={`${it.cat}-${i}`} className="group card overflow-hidden">
              <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-0.5">
                    {categories[it.cat] ?? it.cat}
                  </span>
                  <span className="block text-sm font-bold text-gray-900 dark:text-white">{it.q}</span>
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{it.a}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
