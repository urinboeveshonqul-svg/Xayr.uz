/**
 * Responsive campaign-grid page sizing — pure, testable logic shared by the
 * server listing page (clamping the `size` search param) and the client sizer
 * (measuring the viewport). Server-side pagination is preserved: the client only
 * tells the server how many rows fit, and the server fetches exactly that page.
 *
 * Rules: never fewer than MIN_PAGE_SIZE; always a whole number of full rows for
 * the current column count; capped at MAX_PAGE_SIZE so a huge monitor can't
 * request an unbounded page.
 */

export const MIN_PAGE_SIZE = 10;
export const DEFAULT_PAGE_SIZE = 12; // divisible by 1/2/3/4 → full rows at every breakpoint
export const MAX_PAGE_SIZE = 48;

/** Clamp a raw `size` param to [MIN, MAX]; falls back to DEFAULT when absent/NaN. */
export function clampPageSize(raw: number | string | null | undefined): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(n)));
}

/** Column count for a viewport width — mirrors the grid's Tailwind breakpoints
 * (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`). */
export function columnsForWidth(width: number): 1 | 2 | 3 | 4 {
  if (width >= 1280) return 4; // xl
  if (width >= 1024) return 3; // lg
  if (width >= 640) return 2; // sm
  return 1;
}

/**
 * Full-row page size that fills the available height: as many complete rows as
 * fit, but never fewer than MIN_PAGE_SIZE and never more than MAX_PAGE_SIZE.
 * Always returns `columns × rows`, so the page shows only complete rows.
 */
export function responsivePageSize(opts: {
  columns: number;
  availableHeight: number;
  cardHeight: number;
  gap: number;
}): number {
  const cols = Math.max(1, Math.floor(opts.columns));
  const rowUnit = Math.max(1, opts.cardHeight + opts.gap);
  const rowsThatFit = Math.max(1, Math.floor((opts.availableHeight + opts.gap) / rowUnit));

  const minRows = Math.ceil(MIN_PAGE_SIZE / cols); // enough rows to reach ≥ MIN
  const maxRows = Math.max(minRows, Math.floor(MAX_PAGE_SIZE / cols));
  const rows = Math.min(maxRows, Math.max(minRows, rowsThatFit));

  return cols * rows;
}
