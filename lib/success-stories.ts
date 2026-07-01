// ============================================================
// Success Stories — the single source of truth for what qualifies as a verified
// success story. A campaign qualifies ONLY when ALL are true:
//   1. Goal reached (current_amount >= goal_amount, goal > 0)
//   2. Status is 'completed' or 'funded' (ended / owner-closed)
//   3. A completion report exists AND has been APPROVED by an admin
//
// Reused everywhere (homepage, /campaigns success filter, creator profile) so the
// rule can never drift between surfaces. All filtering is server-side; the set of
// approved-report campaigns is small and bounded, so nothing large is scanned.
// Derives entirely from existing fields (campaign_reports.status + campaign
// status/goal) — no denormalized flag, no duplicated data. Approving/revoking a
// report changes the result automatically on the next query.
// ============================================================

import { createClient } from '@/lib/supabase/server';
import type { Campaign, CampaignReport } from '@/types';

export type SuccessStoryReport = Pick<
  CampaignReport,
  'id' | 'campaign_id' | 'title' | 'message' | 'images' | 'reviewed_at' | 'created_at'
>;

export interface SuccessStory {
  campaign: Campaign;
  report: SuccessStoryReport;
}

export const SUCCESS_STATUSES = ['completed', 'funded'] as const;

function goalReached(c: { current_amount: number | null; goal_amount: number | null }): boolean {
  return (c.goal_amount ?? 0) > 0 && (c.current_amount ?? 0) >= (c.goal_amount ?? 0);
}

/**
 * Campaign IDs that qualify as verified Success Stories. Used by the /campaigns
 * "Success Stories" search filter to constrain the paginated query server-side.
 */
export async function getSuccessStoryIds(): Promise<string[]> {
  try {
    const supabase = await createClient();
    // Approved reports only (RLS + explicit filter). Small, bounded set.
    const { data: reps } = await supabase
      .from('campaign_reports')
      .select('campaign_id')
      .eq('status', 'approved');
    const ids = [...new Set((reps ?? []).map((r) => r.campaign_id))];
    if (ids.length === 0) return [];

    const { data: camps } = await supabase
      .from('campaigns')
      .select('id, current_amount, goal_amount')
      .in('id', ids)
      .in('status', SUCCESS_STATUSES as unknown as string[]);
    return (camps ?? []).filter(goalReached).map((c) => c.id);
  } catch {
    return [];
  }
}

/**
 * Full Success Stories (campaign + its approved report), newest-approved first.
 * Powers the homepage section and any success-story card list.
 */
export async function getSuccessStories(limit = 6): Promise<SuccessStory[]> {
  try {
    const supabase = await createClient();
    const { data: reps } = await supabase
      .from('campaign_reports')
      .select('id, campaign_id, title, message, images, reviewed_at, created_at')
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    const reports = (reps ?? []) as SuccessStoryReport[];
    // Keep the latest approved report per campaign.
    const byCampaign = new Map<string, SuccessStoryReport>();
    for (const r of reports) if (!byCampaign.has(r.campaign_id)) byCampaign.set(r.campaign_id, r);
    const ids = [...byCampaign.keys()];
    if (ids.length === 0) return [];

    const { data: camps } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url), categories(slug)')
      .in('id', ids)
      .in('status', SUCCESS_STATUSES as unknown as string[]);
    const campaigns = (camps as unknown as Campaign[]) ?? [];

    const stories: SuccessStory[] = [];
    for (const c of campaigns) {
      if (!goalReached(c)) continue;
      const report = byCampaign.get(c.id);
      if (report) stories.push({ campaign: c, report });
    }
    // Re-sort by approval date (the .in() campaign fetch doesn't preserve order).
    stories.sort((a, b) => {
      const da = a.report.reviewed_at ?? a.report.created_at;
      const db = b.report.reviewed_at ?? b.report.created_at;
      return da < db ? 1 : da > db ? -1 : 0;
    });
    return stories.slice(0, limit);
  } catch {
    return [];
  }
}
