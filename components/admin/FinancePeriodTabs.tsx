'use client';

import { useState } from 'react';

export interface FinancePeriod {
  key: string;
  label: string;
  amount: string;
  sub?: string;
}

/** Today / Week / Month / Year / All-Time donation totals as selectable tabs. */
export function FinancePeriodTabs({ periods, caption }: { periods: FinancePeriod[]; caption: string }) {
  const [active, setActive] = useState(periods.length - 1); // default: All Time
  const current = periods[active] ?? periods[0];

  return (
    <section className="card p-5">
      <div className="flex flex-wrap gap-2 mb-4">
        {periods.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
              i === active
                ? 'bg-brand-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">{caption}</div>
      <div className="text-3xl font-black text-gray-900 dark:text-white break-words mt-1">{current?.amount}</div>
      {current?.sub && <div className="text-xs text-gray-400 mt-1">{current.sub}</div>}
    </section>
  );
}
