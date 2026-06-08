'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Shared client-side cache of the current user's saved campaign IDs.
 *
 * A grid can render many <SaveButton>s; without a shared cache each one would
 * issue its own "is this saved?" query (N+1). Instead the first caller triggers
 * a single fetch of ALL the user's saved campaign_ids, and every button reads
 * from the resolved Set. Toggles mutate the same Set so state stays consistent
 * within a client navigation. A full reload refetches.
 */
let cache: Promise<Set<string>> | null = null;

async function fetchSavedIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from('saved_campaigns')
    .select('campaign_id')
    .eq('user_id', user.id);
  return new Set((data ?? []).map((r) => r.campaign_id));
}

export function loadSavedIds(): Promise<Set<string>> {
  if (!cache) cache = fetchSavedIds();
  return cache;
}

/** Reflect a local toggle in the shared cache (if it's been loaded). */
export async function markSaved(campaignId: string, saved: boolean): Promise<void> {
  const set = await loadSavedIds();
  if (saved) set.add(campaignId);
  else set.delete(campaignId);
}
