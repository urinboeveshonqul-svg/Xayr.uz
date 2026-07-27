import { describe, it, expect } from 'vitest';
import {
  isEligibleCampaign,
  rankPopularCampaigns,
  POPULAR_CAMPAIGN_LIMIT,
  type RankableCampaign,
} from '@/lib/popular-campaigns';

// Minimal campaign shape — ranking only reads these fields.
function c(
  id: string,
  raised: number,
  donors = 0,
  created = '2026-01-01T00:00:00Z',
  status = 'active',
): RankableCampaign {
  return {
    id,
    status,
    current_amount: raised,
    donors_count: donors,
    created_at: created,
  } as RankableCampaign;
}

const NO_DONATIONS = new Map<string, number>();
const ids = (list: readonly RankableCampaign[]) => list.map((x) => x.id);
const at = (iso: string) => Date.parse(iso);

describe('isEligibleCampaign', () => {
  it('accepts an active campaign with funds raised', () => {
    expect(isEligibleCampaign(c('a', 1))).toBe(true);
  });

  it('rejects a campaign that has raised nothing', () => {
    expect(isEligibleCampaign(c('a', 0))).toBe(false);
  });

  it('rejects every non-active status even when funded', () => {
    for (const status of [
      'draft',
      'pending',
      'rejected',
      'completed',
      'funded',
      'expired',
      'paused',
      'cancelled',
      'hidden',
      'deleted',
    ]) {
      expect(isEligibleCampaign(c('a', 500_000, 3, '2026-01-01T00:00:00Z', status))).toBe(false);
    }
  });
});

describe('rankPopularCampaigns — funds raised is the primary key', () => {
  it('orders by total raised, descending', () => {
    const out = rankPopularCampaigns([c('low', 100), c('high', 900), c('mid', 500)], NO_DONATIONS);
    expect(ids(out)).toEqual(['high', 'mid', 'low']);
  });

  it('never returns a campaign with 0 raised, even if nothing else qualifies', () => {
    const out = rankPopularCampaigns([c('zero', 0), c('alsoZero', 0)], NO_DONATIONS);
    expect(out).toEqual([]);
  });

  it('drops 0-raised campaigns while keeping funded ones', () => {
    const out = rankPopularCampaigns([c('zero', 0), c('funded', 10)], NO_DONATIONS);
    expect(ids(out)).toEqual(['funded']);
  });

  it('excludes non-active campaigns that out-raise the active ones', () => {
    const out = rankPopularCampaigns(
      [c('completed', 9_000_000, 50, '2026-01-01T00:00:00Z', 'completed'), c('active', 5)],
      NO_DONATIONS,
    );
    expect(ids(out)).toEqual(['active']);
  });

  it('defaults to the size of the Popular grid', () => {
    // More eligible campaigns than the grid shows: the default limit decides.
    const many = Array.from({ length: POPULAR_CAMPAIGN_LIMIT + 4 }, (_, i) =>
      c(`c${i}`, 1_000 - i),
    );
    const out = rankPopularCampaigns(many, NO_DONATIONS);
    expect(out).toHaveLength(POPULAR_CAMPAIGN_LIMIT);
    // And it took the TOP ones, not just the first N encountered.
    expect(ids(out)[0]).toBe('c0');
  });

  it('honours an explicit limit', () => {
    const many = [c('a', 5), c('b', 4), c('c', 3), c('d', 2), c('e', 1)];
    expect(ids(rankPopularCampaigns(many, NO_DONATIONS, 2))).toEqual(['a', 'b']);
    expect(rankPopularCampaigns(many, NO_DONATIONS, 0)).toEqual([]);
  });

  it('returns fewer than the limit when fewer campaigns qualify', () => {
    const few = [c('a', 5), c('b', 4), c('zero', 0)];
    expect(ids(rankPopularCampaigns(few, NO_DONATIONS))).toEqual(['a', 'b']);
  });

  it('handles an empty candidate set', () => {
    expect(rankPopularCampaigns([], NO_DONATIONS)).toEqual([]);
  });
});

describe('rankPopularCampaigns — tiebreakers', () => {
  it('1st tiebreak: equal raised → higher donor count wins', () => {
    const out = rankPopularCampaigns([c('few', 500, 2), c('many', 500, 40)], NO_DONATIONS);
    expect(ids(out)).toEqual(['many', 'few']);
  });

  it('2nd tiebreak: equal raised + donors → most recent donation wins', () => {
    const stale = c('stale', 500, 5, '2026-01-01T00:00:00Z');
    const fresh = c('fresh', 500, 5, '2026-01-01T00:00:00Z');
    const lastDonation = new Map([
      [stale.id, at('2026-05-01T00:00:00Z')],
      [fresh.id, at('2026-07-01T00:00:00Z')],
    ]);
    expect(ids(rankPopularCampaigns([stale, fresh], lastDonation))).toEqual(['fresh', 'stale']);
  });

  it('3rd tiebreak: equal raised + donors + donation time → newest campaign wins', () => {
    const older = c('older', 500, 5, '2026-01-01T00:00:00Z');
    const newer = c('newer', 500, 5, '2026-06-01T00:00:00Z');
    const sameDonation = new Map([
      [older.id, at('2026-07-01T00:00:00Z')],
      [newer.id, at('2026-07-01T00:00:00Z')],
    ]);
    expect(ids(rankPopularCampaigns([older, newer], sameDonation))).toEqual(['newer', 'older']);
  });

  it('falls back to newest campaign when donation times are unavailable', () => {
    const older = c('older', 500, 5, '2026-01-01T00:00:00Z');
    const newer = c('newer', 500, 5, '2026-06-01T00:00:00Z');
    expect(ids(rankPopularCampaigns([older, newer], NO_DONATIONS))).toEqual(['newer', 'older']);
  });

  it('applies the keys in strict precedence order', () => {
    // 'topRaised' loses on every later key but still ranks first on amount.
    const topRaised = c('topRaised', 1_000, 1, '2020-01-01T00:00:00Z');
    const runnerUp = c('runnerUp', 999, 900, '2026-07-01T00:00:00Z');
    const lastDonation = new Map([
      [topRaised.id, at('2020-01-01T00:00:00Z')],
      [runnerUp.id, at('2026-07-20T00:00:00Z')],
    ]);
    expect(ids(rankPopularCampaigns([runnerUp, topRaised], lastDonation))).toEqual([
      'topRaised',
      'runnerUp',
    ]);
  });

  it('resolves a tie group that straddles the visible cut', () => {
    // Four campaigns tied on amount+donors but only three slots: the donation
    // tiebreak must decide which one is dropped, not insertion order.
    const tied = ['w', 'x', 'y', 'z'].map((id) => c(id, 500, 5, '2026-01-01T00:00:00Z'));
    const lastDonation = new Map([
      ['w', at('2026-04-01T00:00:00Z')],
      ['x', at('2026-07-01T00:00:00Z')],
      ['y', at('2026-06-01T00:00:00Z')],
      ['z', at('2026-05-01T00:00:00Z')],
    ]);
    expect(ids(rankPopularCampaigns(tied, lastDonation, 3))).toEqual(['x', 'y', 'z']);
    // With room for all four, the same ordering still holds end to end.
    expect(ids(rankPopularCampaigns(tied, lastDonation))).toEqual(['x', 'y', 'z', 'w']);
  });
});

describe('rankPopularCampaigns — homepage invariants', () => {
  const mixed: RankableCampaign[] = [
    c('draft', 0, 0, '2026-07-20T00:00:00Z', 'draft'),
    c('pending', 800_000, 9, '2026-07-19T00:00:00Z', 'pending'),
    c('rejected', 700_000, 8, '2026-07-18T00:00:00Z', 'rejected'),
    c('completed', 5_000_000, 80, '2026-07-17T00:00:00Z', 'completed'),
    c('hidden', 900_000, 10, '2026-07-16T00:00:00Z', 'hidden'),
    c('deleted', 950_000, 11, '2026-07-15T00:00:00Z', 'deleted'),
    c('expired', 880_000, 14, '2026-07-13T00:00:00Z', 'expired'),
    c('paused', 870_000, 13, '2026-07-12T00:00:00Z', 'paused'),
    c('cancelled', 860_000, 12, '2026-07-11T00:00:00Z', 'cancelled'),
    c('funded', 4_000_000, 60, '2026-07-10T00:00:00Z', 'funded'),
    c('activeUnfunded', 0, 0, '2026-07-25T00:00:00Z'),
    c('activeSmall', 25_000, 1, '2026-07-14T00:00:00Z'),
    c('activeBig', 600_000, 12, '2026-02-01T00:00:00Z'),
    c('activeMid', 300_000, 30, '2026-03-01T00:00:00Z'),
  ];

  it('shows only the highest-funded active campaigns', () => {
    expect(ids(rankPopularCampaigns(mixed, NO_DONATIONS))).toEqual([
      'activeBig',
      'activeMid',
      'activeSmall',
    ]);
  });

  it('every rendered campaign is active with a positive raised total', () => {
    for (const shown of rankPopularCampaigns(mixed, NO_DONATIONS)) {
      expect(shown.status).toBe('active');
      expect(shown.current_amount ?? 0).toBeGreaterThan(0);
    }
  });

  it('is monotonically non-increasing in raised amount', () => {
    const out = rankPopularCampaigns(mixed, NO_DONATIONS, 10);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].current_amount ?? 0).toBeGreaterThanOrEqual(out[i].current_amount ?? 0);
    }
  });

  it('never picks a lower-funded campaign over a higher-funded active one', () => {
    const out = rankPopularCampaigns(mixed, NO_DONATIONS);
    const eligible = mixed.filter(isEligibleCampaign);
    const best = Math.max(...eligible.map((x) => x.current_amount ?? 0));
    expect(out[0].current_amount).toBe(best);
  });
});
