import { describe, it, expect } from 'vitest';
import {
  MAX_GOAL_AMOUNT,
  MAX_DURATION_DAYS,
  isGoalWithinLimit,
  isDurationWithinLimit,
  maxDeadlineISO,
  todayISO,
} from '@/lib/campaign-limits';

// Fixed reference point so date math is deterministic.
const FROM = new Date('2026-08-01T09:00:00Z');
const dayOffset = (n: number): string => {
  const d = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('goal limit', () => {
  it('accepts a valid goal below the cap', () => {
    expect(isGoalWithinLimit(500_000_000)).toBe(true);
    expect(isGoalWithinLimit(100_000)).toBe(true);
  });

  it('accepts a goal exactly at 1,000,000,000', () => {
    expect(MAX_GOAL_AMOUNT).toBe(1_000_000_000);
    expect(isGoalWithinLimit(1_000_000_000)).toBe(true);
  });

  it('rejects a goal above 1,000,000,000', () => {
    expect(isGoalWithinLimit(1_000_000_001)).toBe(false);
    expect(isGoalWithinLimit(5_000_000_000)).toBe(false);
  });

  it('rejects non-positive / non-finite goals', () => {
    expect(isGoalWithinLimit(0)).toBe(false);
    expect(isGoalWithinLimit(-1)).toBe(false);
    expect(isGoalWithinLimit(Number.NaN)).toBe(false);
    expect(isGoalWithinLimit(Infinity)).toBe(false);
  });
});

describe('duration limit', () => {
  it('MAX_DURATION_DAYS is 60 and maxDeadlineISO is that many days out', () => {
    expect(MAX_DURATION_DAYS).toBe(60);
    expect(todayISO(FROM)).toBe('2026-08-01');
    expect(maxDeadlineISO(FROM)).toBe(dayOffset(60)); // 2026-09-30
  });

  it('accepts a valid end date within the window', () => {
    expect(isDurationWithinLimit(dayOffset(1), FROM)).toBe(true);
    expect(isDurationWithinLimit(dayOffset(30), FROM)).toBe(true);
    expect(isDurationWithinLimit(todayISO(FROM), FROM)).toBe(true); // today allowed
  });

  it('accepts an end date exactly 60 days out', () => {
    expect(isDurationWithinLimit(dayOffset(60), FROM)).toBe(true);
  });

  it('rejects an end date beyond 60 days', () => {
    expect(isDurationWithinLimit(dayOffset(61), FROM)).toBe(false);
    expect(isDurationWithinLimit(dayOffset(120), FROM)).toBe(false);
  });

  it('rejects an end date before today', () => {
    expect(isDurationWithinLimit(dayOffset(-1), FROM)).toBe(false);
  });

  it('rejects malformed / impossible dates', () => {
    expect(isDurationWithinLimit('', FROM)).toBe(false);
    expect(isDurationWithinLimit('2026-13-01', FROM)).toBe(false);
    expect(isDurationWithinLimit('2026-02-30', FROM)).toBe(false);
    expect(isDurationWithinLimit('not-a-date', FROM)).toBe(false);
  });
});
