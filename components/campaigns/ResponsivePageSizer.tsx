'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { columnsForWidth, responsivePageSize } from '@/lib/responsive-grid';

/**
 * Measures the viewport (column count for the width + how many complete card rows
 * fit the height) and writes the result to the `size` search param, so the SERVER
 * fetches exactly one page of that many campaigns. Renders nothing.
 *
 * Server-side pagination is preserved — this only chooses the page size; the
 * fetch + range stay on the server. Uses router.replace (no history spam,
 * scroll: false) and recomputes on debounced resize. When the size changes it
 * returns to page 1 to avoid landing on an out-of-range page.
 */
const GRID_SELECTOR = '[data-campaign-grid]';
const FALLBACK_CARD_HEIGHT = 400; // used before a card has been measured
const FALLBACK_GAP = 24; // Tailwind gap-6
const PAGINATION_RESERVE = 96; // leave room below the grid for the pager

function measureDesiredSize(): number {
  const columns = columnsForWidth(window.innerWidth);
  const grid = document.querySelector<HTMLElement>(GRID_SELECTOR);

  let cardHeight = FALLBACK_CARD_HEIGHT;
  let gap = FALLBACK_GAP;
  let gridTop = Math.min(240, window.innerHeight * 0.3);

  if (grid) {
    const first = grid.firstElementChild as HTMLElement | null;
    const measured = first?.getBoundingClientRect().height ?? 0;
    if (measured > 0) cardHeight = measured;
    const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap);
    if (Number.isFinite(rowGap) && rowGap >= 0) gap = rowGap;
    gridTop = grid.getBoundingClientRect().top;
  }

  const availableHeight = window.innerHeight - gridTop - PAGINATION_RESERVE;
  return responsivePageSize({ columns, availableHeight, cardHeight, gap });
}

export function ResponsivePageSizer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = () => {
      const desired = measureDesiredSize();
      const current = Number.parseInt(searchParams.get('size') ?? '', 10);
      if (current === desired) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set('size', String(desired));
      params.delete('page'); // size changed → reset to the first page
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    // Measure after the browser has laid out the grid.
    frame = requestAnimationFrame(apply);

    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, 250);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [pathname, searchParams, router]);

  return null;
}
