import { describe, it, expect } from 'vitest';
import {
  isPickableCampaign,
  rankPickedCampaigns,
  PICKED_CAMPAIGN_LIMIT,
  type RankableCampaign,
} from '@/lib/picked-campaigns';

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

describe('isPickableCampaign', () => {
  it('accepts an active campaign with funds raised', () => {
    expect(isPickableCampaign(c('a', 1))).toBe(true);
  });

  it('rejects a campaign that has raised nothing', () => {
    expect(isPickableCampaign(c('a', 0))).toBe(false);
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
      expect(isPickableCampaign(c('a', 500_000, 3, '2026-01-01T00:00:00Z', status))).toBe(false);
    }
  });
});

describe('rankPickedCampaigns — funds raised is the primary key', () => {
  it('orders by total raised, descending', () => {
    const out = rankPickedCampaigns([c('low', 100), c('high', 900), c('mid', 500)], NO_DONATIONS);
    expect(ids(out)).toEqual(['high', 'mid', 'low']);
  });

  it('never returns a campaign with 0 raised, even if nothing else qualifies', () => {
    const out = rankPickedCampaigns([c('zero', 0), c('alsoZero', 0)], NO_DONATIONS);
    expect(out).toEqual([]);
  });

  it('drops 0-raised campaigns while keeping funded ones', () => {
    const out = rankPickedCampaigns([c('zero', 0), c('funded', 10)], NO_DONATIONS);
    expect(ids(out)).toEqual(['funded']);
  });

  it('excludes non-active campaigns that out-raise the active ones', () => {
    const out = rankPickedCampaigns(
      [c('completed', 9_000_000, 50, '2026-01-01T00:00:00Z', 'completed'), c('active', 5)],
      NO_DONATIONS,
    );
    expect(ids(out)).toEqual(['active']);
  });

  it('honours the limit and defaults to the 3-card grid', () => {
    const many = [c('a', 5), c('b', 4), c('c', 3), c('d', 2), c('e', 1)];
    expect(rankPickedCampaigns(many, NO_DONATIONS)).toHaveLength(PICKED_CAMPAIGN_LIMIT);
    expect(ids(rankPickedCampaigns(many, NO_DONATIONS, 2))).toEqual(['a', 'b']);
    expect(rankPickedCampaigns(many, NO_DONATIONS, 0)).toEqual([]);
  });

  it('handles an empty candidate set', () => {
    expect(rankPickedCampaigns([], NO_DONATIONS)).toEqual([]);
  });
});

describe('rankPickedCampaigns — tiebreakers', () => {
  it('1st tiebreak: equal raised → higher donor count wins', () => {
    const out = rankPickedCampaigns([c('few', 500, 2), c('many', 500, 40)], NO_DONATIONS);
    expect(ids(out)).toEqual(['many', 'few']);
  });

  it('2nd tiebreak: equal raised + donors → most recent donation wins', () => {
    const stale = c('stale', 500, 5, '2026-01-01T00:00:00Z');
    const fresh = c('fresh', 500, 5, '2026-01-01T00:00:00Z');
    const lastDonation = new Map([
      [stale.id, at('2026-05-01T00:00:00Z')],
      [fresh.id, at('2026-07-01T00:00:00Z')],
    ]);
    expect(ids(rankPickedCampaigns([stale, fresh], lastDonation))).toEqual(['fresh', 'stale']);
  });

  it('3rd tiebreak: equal raised + donors + donation time → newest campaign wins', () => {
    const older = c('older', 500, 5, '2026-01-01T00:00:00Z');
    const newer = c('newer', 500, 5, '2026-06-01T00:00:00Z');
    const sameDonation = new Map([
      [older.id, at('2026-07-01T00:00:00Z')],
      [newer.id, at('2026-07-01T00:00:00Z')],
    ]);
    expect(ids(rankPickedCampaigns([older, newer], sameDonation))).toEqual(['newer', 'older']);
  });

  it('falls back to newest campaign when donation times are unavailable', () => {
    const older = c('older', 500, 5, '2026-01-01T00:00:00Z');
    const newer = c('newer', 500, 5, '2026-06-01T00:00:00Z');
    expect(ids(rankPickedCampaigns([older, newer], NO_DONATIONS))).toEqual(['newer', 'older']);
  });

  it('applies the keys in strict precedence order', () => {
    // 'topRaised' loses on every later key but still ranks first on amount.
    const topRaised = c('topRaised', 1_000, 1, '2020-01-01T00:00:00Z');
    const runnerUp = c('runnerUp', 999, 900, '2026-07-01T00:00:00Z');
    const lastDonation = new Map([
      [topRaised.id, at('2020-01-01T00:00:00Z')],
      [runnerUp.id, at('2026-07-20T00:00:00Z')],
    ]);
    expect(ids(rankPickedCampaigns([runnerUp, topRaised], lastDonation))).toEqual([
      'topRaised',
      'runnerUp',
    ]);
  });

  it('resolves a tie group that straddles the visible cut', () => {
    // Four campaigns tied on amount+donors; only the top 3 render, so the
    // donation tiebreak must decide which one is dropped.
    const tied = ['w', 'x', 'y', 'z'].map((id) => c(id, 500, 5, '2026-01-01T00:00:00Z'));
    const lastDonation = new Map([
      ['w', at('2026-04-01T00:00:00Z')],
      ['x', at('2026-07-01T00:00:00Z')],
      ['y', at('2026-06-01T00:00:00Z')],
      ['z', at('2026-05-01T00:00:00Z')],
    ]);
    expect(ids(rankPickedCampaigns(tied, lastDonation))).toEqual(['x', 'y', 'z']);
  });
});

describe('rankPickedCampaigns — homepage invariants', () => {
  const mixed: RankableCampaign[] = [
    c('draft', 0, 0, '2026-07-20T00:00:00Z', 'draft'),
    c('pending', 800_000, 9, '2026-07-19T00:00:00Z', 'pending'),
    c('rejected', 700_000, 8, '2026-07-18T00:00:00Z', 'rejected'),
    c('completed', 5_000_000, 80, '2026-07-17T00:00:00Z', 'completed'),
    c('hidden', 900_000, 10, '2026-07-16T00:00:00Z', 'hidden'),
    c('deleted', 950_000, 11, '2026-07-15T00:00:00Z', 'deleted'),
    c('activeUnfunded', 0, 0, '2026-07-25T00:00:00Z'),
    c('activeSmall', 25_000, 1, '2026-07-14T00:00:00Z'),
    c('activeBig', 600_000, 12, '2026-02-01T00:00:00Z'),
    c('activeMid', 300_000, 30, '2026-03-01T00:00:00Z'),
  ];

  it('shows only the highest-funded active campaigns', () => {
    expect(ids(rankPickedCampaigns(mixed, NO_DONATIONS))).toEqual([
      'activeBig',
      'activeMid',
      'activeSmall',
    ]);
  });

  it('every rendered campaign is active with a positive raised total', () => {
    for (const picked of rankPickedCampaigns(mixed, NO_DONATIONS)) {
      expect(picked.status).toBe('active');
      expect(picked.current_amount ?? 0).toBeGreaterThan(0);
    }
  });

  it('is monotonically non-increasing in raised amount', () => {
    const out = rankPickedCampaigns(mixed, NO_DONATIONS, 10);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].current_amount ?? 0).toBeGreaterThanOrEqual(out[i].current_amount ?? 0);
    }
  });

  it('never picks a lower-funded campaign over a higher-funded active one', () => {
    const out = rankPickedCampaigns(mixed, NO_DONATIONS);
    const eligible = mixed.filter(isPickableCampaign);
    const best = Math.max(...eligible.map((x) => x.current_amount ?? 0));
    expect(out[0].current_amount).toBe(best);
  });
});
