// ============================================================
// Picked Campaigns — the single source of truth for the homepage's "Picked"
// section (`dict.home.featured*`).
//
// A campaign qualifies ONLY when BOTH hold:
//   1. status = 'active' — so draft / pending / rejected / completed / funded /
//      expired / paused / cancelled are all excluded by construction. Anything
//      not actively collecting donations can never appear here.
//   2. total raised > 0 — a never-funded campaign is excluded outright.
//
// Ranking, highest first:
//   1. total raised          → campaigns.current_amount
//   2. donor count          → campaigns.donors_count
//   3. most recent donation → latest completed donation (campaign_donors view)
//   4. newest campaign      → campaigns.created_at
//
// There is no admin "featured" flag in the schema and none is introduced: the
// section is derived entirely from money actually raised, so it cannot be
// curated and it re-ranks itself as donations land (within the homepage's ISR
// window). `current_amount` / `donors_count` are the denormalized totals
// maintained by the apply_donation() trigger — credited on a completed donation
// and reversed on refund/failure — so "raised" here is always the live net
// total, never a stale or client-supplied number.
//
// Performance: the filter and the first two ranking keys run in Postgres against
// the existing partial indexes `idx_campaigns_active_raised (current_amount
// desc) where status='active'` and `idx_campaigns_active_donors`, so no
// full-table scan and no client-side sorting of the campaign set. The
// most-recent-donation key is the one value Postgres does not keep on
// `campaigns`; rather than add a denormalized column (a migration), it is
// resolved by ONE extra indexed query against the existing public
// `campaign_donors` view — and only when candidates actually tie on BOTH amount
// and donor count, which is the rare case.
//
// The qualification rule is re-applied in `isPickableCampaign` after the query
// as defence in depth: if the DB predicate were ever weakened, a 0-raised or
// non-active campaign still cannot reach the homepage.
// ============================================================

import { createClient } from '@/lib/supabase/server';
import type { Campaign } from '@/types';

/** How many campaigns the homepage "Picked" grid shows (3-up card layout). */
export const PICKED_CAMPAIGN_LIMIT = 3;

/** The only campaign status eligible to be picked. */
export const PICKED_STATUS = 'active';

/** The organizer + category embeds every campaign card needs. */
const CAMPAIGN_CARD_SELECT = '*, profiles:users(full_name, avatar_url), categories(slug)';

/** Latest completed-donation time per campaign id, in epoch ms. */
export type LastDonationMap = ReadonlyMap<string, number>;

/** Only the fields ranking depends on — so the pure helpers stay testable. */
export type RankableCampaign = Pick<
  Campaign,
  'id' | 'status' | 'current_amount' | 'donors_count' | 'created_at'
>;

const ts = (v?: string | null): number => (v ? Date.parse(v) || 0 : 0);

const raisedOf = (c: RankableCampaign): number => c.current_amount ?? 0;
const donorsOf = (c: RankableCampaign): number => c.donors_count ?? 0;

/**
 * Active AND actually funded. Enforced in the DB query and re-checked here, so a
 * campaign with nothing raised can never render in the section.
 */
export function isPickableCampaign(c: RankableCampaign): boolean {
  return c.status === PICKED_STATUS && raisedOf(c) > 0;
}

/** Campaigns tie only when raised AND donor count are both equal. */
const tieKey = (c: RankableCampaign): string => `${raisedOf(c)}:${donorsOf(c)}`;

/**
 * The full four-key ordering. Pure: `lastDonation` supplies key 3, and a missing
 * entry sorts as "no donation seen", falling through to newest-campaign.
 */
export function comparePickedCampaigns(
  a: RankableCampaign,
  b: RankableCampaign,
  lastDonation: LastDonationMap,
): number {
  const byRaised = raisedOf(b) - raisedOf(a);
  if (byRaised !== 0) return byRaised;
  const byDonors = donorsOf(b) - donorsOf(a);
  if (byDonors !== 0) return byDonors;
  const byDonation = (lastDonation.get(b.id) ?? 0) - (lastDonation.get(a.id) ?? 0);
  if (byDonation !== 0) return byDonation;
  return ts(b.created_at) - ts(a.created_at);
}

/**
 * Filter to pickable campaigns, rank them, and take the top `limit`. Pure — the
 * homepage's guarantee ("highest funded first, never a 0-raised campaign") is
 * this function, so it is what the tests pin down.
 */
export function rankPickedCampaigns<T extends RankableCampaign>(
  candidates: readonly T[],
  lastDonation: LastDonationMap,
  limit: number = PICKED_CAMPAIGN_LIMIT,
): T[] {
  if (limit <= 0) return [];
  return candidates
    .filter(isPickableCampaign)
    .slice()
    .sort((a, b) => comparePickedCampaigns(a, b, lastDonation))
    .slice(0, limit);
}

/**
 * Rows fetched from the DB before tiebreaking. Always more than `limit` so a tie
 * group straddling the cut can be resolved with the whole group in hand.
 */
function candidateLimit(limit: number): number {
  return Math.max(limit * 4, 24);
}

/**
 * Campaign ids that need the donation tiebreak: those sharing both raised amount
 * and donor count with another candidate, where the tie can affect the visible
 * slice. Returns `[]` in the normal no-tie case so no extra query runs.
 */
function contestedIds(candidates: readonly RankableCampaign[], limit: number): string[] {
  const groups = new Map<string, string[]>();
  for (const c of candidates) {
    const key = tieKey(c);
    const group = groups.get(key);
    if (group) group.push(c.id);
    else groups.set(key, [c.id]);
  }
  const visibleKeys = new Set(candidates.slice(0, limit).map(tieKey));
  const ids: string[] = [];
  for (const key of visibleKeys) {
    const group = groups.get(key);
    if (group && group.length > 1) ids.push(...group);
  }
  return ids;
}

/**
 * Latest completed-donation timestamp per campaign, read from the public
 * `campaign_donors` view — which already restricts to `status='completed'`, is
 * anon-readable, and exposes no donor PII (the same source the campaign donor
 * feed uses). Ordered in the DB, so the first row seen per campaign is its
 * latest. A failure degrades the tiebreak to "newest campaign" rather than
 * breaking the homepage.
 */
async function lastDonationAt(ids: string[]): Promise<Map<string, number>> {
  const latest = new Map<string, number>();
  if (ids.length === 0) return latest;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaign_donors')
      .select('campaign_id, created_at')
      .in('campaign_id', ids)
      .order('created_at', { ascending: false });
    if (error) return latest;
    for (const d of data ?? []) {
      if (!latest.has(d.campaign_id)) latest.set(d.campaign_id, ts(d.created_at));
    }
  } catch {
    /* ranking degrades to created_at */
  }
  return latest;
}

/**
 * The highest-funded ACTIVE campaigns, best first. Never returns a campaign with
 * zero raised, and never a non-active one. Returns `[]` on any failure so the
 * homepage renders without the section rather than erroring.
 */
export async function getPickedCampaigns(
  limit: number = PICKED_CAMPAIGN_LIMIT,
): Promise<Campaign[]> {
  if (limit <= 0) return [];
  try {
    const supabase = await createClient();
    // Filtering + primary ranking happen in Postgres (indexed), not here.
    const { data, error } = await supabase
      .from('campaigns')
      .select(CAMPAIGN_CARD_SELECT)
      .eq('status', PICKED_STATUS)
      .gt('current_amount', 0)
      .order('current_amount', { ascending: false })
      .order('donors_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(candidateLimit(limit));

    if (error) return [];
    const candidates = (data as unknown as Campaign[]) ?? [];
    if (candidates.length === 0) return [];

    // The DB already returned final order unless something ties on both amount
    // and donor count, so the donation query normally never runs.
    const tied = contestedIds(candidates, limit);
    const lastDonation = tied.length > 0 ? await lastDonationAt(tied) : new Map<string, number>();

    return rankPickedCampaigns(candidates, lastDonation, limit);
  } catch {
    return [];
  }
}
