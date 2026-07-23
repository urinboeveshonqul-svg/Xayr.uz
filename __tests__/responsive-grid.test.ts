import { describe, it, expect } from 'vitest';
import {
  clampPageSize,
  columnsForWidth,
  responsivePageSize,
  MIN_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@/lib/responsive-grid';

describe('clampPageSize', () => {
  it('defaults when absent or unparseable', () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize('abc')).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize('')).toBe(DEFAULT_PAGE_SIZE);
  });
  it('never returns fewer than 10', () => {
    expect(clampPageSize(1)).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize('5')).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize(-20)).toBe(MIN_PAGE_SIZE);
  });
  it('caps at MAX', () => {
    expect(clampPageSize(1000)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize('49')).toBe(MAX_PAGE_SIZE);
  });
  it('passes through a valid size', () => {
    expect(clampPageSize(20)).toBe(20);
    expect(clampPageSize('16')).toBe(16);
  });
});

describe('columnsForWidth — mirrors the grid breakpoints', () => {
  it('maps widths to 1/2/3/4 columns', () => {
    expect(columnsForWidth(375)).toBe(1); // small phone
    expect(columnsForWidth(639)).toBe(1);
    expect(columnsForWidth(640)).toBe(2); // sm
    expect(columnsForWidth(800)).toBe(2); // large phone / small tablet
    expect(columnsForWidth(1024)).toBe(3); // lg / tablet
    expect(columnsForWidth(1200)).toBe(3);
    expect(columnsForWidth(1280)).toBe(4); // xl / laptop+
    expect(columnsForWidth(2560)).toBe(4); // large desktop
  });
});

describe('responsivePageSize', () => {
  const card = { cardHeight: 400, gap: 24 };

  it('never returns fewer than 10, and returns full rows', () => {
    // Tiny viewport on a phone: only 1 row fits, but MIN forces 10.
    const size = responsivePageSize({ columns: 1, availableHeight: 300, ...card });
    expect(size).toBe(10);
    expect(size).toBeGreaterThanOrEqual(MIN_PAGE_SIZE);
  });

  it('phones (1 col) show at least 10', () => {
    expect(responsivePageSize({ columns: 1, availableHeight: 700, ...card })).toBe(10);
  });

  it('tablets (3 col) show more than phones — a full 12', () => {
    const size = responsivePageSize({ columns: 3, availableHeight: 800, ...card });
    expect(size).toBe(12); // ceil(10/3)=4 rows × 3
    expect(size % 3).toBe(0);
  });

  it('laptop desktop (4 col) fills more rows as height grows', () => {
    const short = responsivePageSize({ columns: 4, availableHeight: 700, ...card });
    const tall = responsivePageSize({ columns: 4, availableHeight: 2000, ...card });
    expect(short).toBe(12); // min 3 rows × 4
    expect(tall).toBe(16); // 4 rows × 4
    expect(tall).toBeGreaterThan(short);
  });

  it('large monitors add complete rows but stay capped at MAX', () => {
    const size = responsivePageSize({ columns: 4, availableHeight: 8000, ...card });
    expect(size).toBe(MAX_PAGE_SIZE); // 12 rows × 4 = 48
    expect(size % 4).toBe(0);
  });

  it('always yields whole rows for the column count', () => {
    for (const columns of [1, 2, 3, 4]) {
      for (const availableHeight of [200, 900, 1800, 5000]) {
        const size = responsivePageSize({ columns, availableHeight, ...card });
        expect(size % columns).toBe(0);
        expect(size).toBeGreaterThanOrEqual(MIN_PAGE_SIZE);
        expect(size).toBeLessThanOrEqual(MAX_PAGE_SIZE);
      }
    }
  });
});
