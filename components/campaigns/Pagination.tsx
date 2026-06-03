'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface PaginationProps {
  page: number;
  totalPages: number;
}

export function Pagination({ page, totalPages }: PaginationProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sliding window of up to 5 page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const navBtn =
    'inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-700';

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 mt-12" aria-label="Pagination">
      <button onClick={() => go(page - 1)} disabled={page <= 1} className={navBtn}>
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">{t('filters.prev')}</span>
      </button>

      {start > 1 && (
        <>
          <button onClick={() => go(1)} className={navBtn}>1</button>
          {start > 2 && <span className="px-1 text-gray-400">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => go(p)}
          aria-current={p === page}
          className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
            p === page
              ? 'bg-brand-600 text-white shadow'
              : 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600'
          }`}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-gray-400">…</span>}
          <button onClick={() => go(totalPages)} className={navBtn}>{totalPages}</button>
        </>
      )}

      <button onClick={() => go(page + 1)} disabled={page >= totalPages} className={navBtn}>
        <span className="hidden sm:inline">{t('filters.next')}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
