import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types';

/**
 * Abandoned-draft cleanup service (reusable by the cron route, a manual admin
 * trigger, or a maintenance script). It removes `campaign_drafts` rows that have
 * not been touched in {@link DRAFT_TTL_DAYS} days AND garbage-collects the images
 * those drafts uploaded to the campaign-images bucket — but ONLY when an image is
 * referenced by nothing else.
 *
 * SAFETY — an image is deleted only when ALL hold:
 *   • it lives in our own campaign-images bucket (URL shape verified),
 *   • no published/pending/rejected/any campaign references it (image_url or images[]),
 *   • no OTHER draft references it (image_url or images[]),
 *   • every reference check succeeded (any error ⇒ treated as "referenced" ⇒ kept).
 * Anything uncertain is KEPT. Published campaigns and their images are never touched.
 *
 * ORPHAN AVOIDANCE — a draft row is deleted only after every image it intended to
 * delete was actually removed. If a storage delete fails, the draft row is RETAINED
 * (not counted as deleted) so the next run retries; nothing is orphaned.
 *
 * The service never throws for normal data conditions — a failed listing / delete
 * is folded into the returned summary so the caller (cron) can log and move on.
 */

export const CAMPAIGN_IMAGE_BUCKET = 'campaign-images';
export const DRAFT_TTL_DAYS = 30;
/** Max drafts processed per run — bounds cost on very large backlogs (see docs). */
export const DEFAULT_DRAFT_SCAN_LIMIT = 500;

// The public-object URL marker for our bucket. A campaign image URL looks like
// `<supabase-url>/storage/v1/object/public/campaign-images/<user>/<file>`.
const BUCKET_MARKER = `/storage/v1/object/public/${CAMPAIGN_IMAGE_BUCKET}/`;

export interface CleanupSummary {
  /** Expired drafts examined this run. */
  draftsScanned: number;
  /** Draft rows successfully deleted. */
  draftsDeleted: number;
  /** Storage objects deleted (only images referenced by nothing else). */
  imagesDeleted: number;
  /** Images kept — still referenced, not ours, or a reference check was uncertain. */
  imagesSkipped: number;
  /** Storage deletes that errored (draft retained for the next run). */
  imageFailures: number;
  /** Draft-row deletes that errored. */
  draftFailures: number;
  /** Wall-clock duration of the run. */
  durationMs: number;
}

export interface CleanupOptions {
  /** Age threshold in days (default {@link DRAFT_TTL_DAYS}). */
  olderThanDays?: number;
  /** Reference time (injected in tests); defaults to now. */
  now?: Date;
  /** Max drafts per run (default {@link DEFAULT_DRAFT_SCAN_LIMIT}). */
  limit?: number;
}

type Client = SupabaseClient<Database>;

/**
 * Extract the storage object path from a campaign-images public URL. Returns null
 * for a URL that is not one of our own bucket objects (so it is never deleted).
 */
export function storagePathFromPublicUrl(url: string): string | null {
  if (typeof url !== 'string') return null;
  const at = url.indexOf(BUCKET_MARKER);
  if (at === -1) return null;
  const raw = url.slice(at + BUCKET_MARKER.length).split('?')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Unique, non-empty image URLs referenced by a draft (cover + gallery). */
export function draftImageUrls(draft: { image_url: string | null; images: string[] | null }): string[] {
  const all = [draft.image_url, ...(draft.images ?? [])].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  return Array.from(new Set(all));
}

/**
 * True only when the image URL is referenced by NOTHING except the draft being
 * deleted. Any reference — in a campaign or another draft — or any query error
 * returns false, so the image is kept (never delete under uncertainty).
 */
async function isImageOrphaned(client: Client, url: string, excludeDraftId: string): Promise<boolean> {
  const checks = [
    client.from('campaigns').select('id').eq('image_url', url).limit(1),
    client.from('campaigns').select('id').contains('images', [url]).limit(1),
    client.from('campaign_drafts').select('id').eq('image_url', url).neq('id', excludeDraftId).limit(1),
    client.from('campaign_drafts').select('id').contains('images', [url]).neq('id', excludeDraftId).limit(1),
  ];
  for (const check of checks) {
    const { data, error } = await check;
    if (error) return false; // uncertainty ⇒ keep
    if (data && data.length > 0) return false; // referenced elsewhere ⇒ keep
  }
  return true;
}

export async function cleanupAbandonedDrafts(
  client: Client,
  options: CleanupOptions = {},
): Promise<CleanupSummary> {
  const startedAt = Date.now();
  const days = options.olderThanDays ?? DRAFT_TTL_DAYS;
  const now = options.now ?? new Date();
  const limit = options.limit ?? DEFAULT_DRAFT_SCAN_LIMIT;
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();

  const summary: CleanupSummary = {
    draftsScanned: 0,
    draftsDeleted: 0,
    imagesDeleted: 0,
    imagesSkipped: 0,
    imageFailures: 0,
    draftFailures: 0,
    durationMs: 0,
  };

  // Only rows strictly older than the cutoff — a draft edited within the window
  // (or a published campaign, which lives in a different table) is never touched.
  const { data: drafts, error: listError } = await client
    .from('campaign_drafts')
    .select('id, image_url, images, updated_at')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (listError || !drafts) {
    summary.durationMs = Date.now() - startedAt;
    return summary;
  }

  for (const draft of drafts) {
    summary.draftsScanned++;

    // Decide which images are safe to delete before touching storage.
    const deletablePaths: string[] = [];
    for (const url of draftImageUrls(draft)) {
      const path = storagePathFromPublicUrl(url);
      if (!path) {
        summary.imagesSkipped++; // not one of our objects → never delete
        continue;
      }
      const orphaned = await isImageOrphaned(client, url, draft.id);
      if (!orphaned) {
        summary.imagesSkipped++; // still referenced / uncertain → keep
        continue;
      }
      deletablePaths.push(path);
    }

    // Delete images one at a time so a single failure neither aborts the run nor
    // the rest of this draft's images.
    let imageFailedForThisDraft = false;
    for (const path of deletablePaths) {
      const { error: removeError } = await client.storage.from(CAMPAIGN_IMAGE_BUCKET).remove([path]);
      if (removeError) {
        summary.imageFailures++;
        imageFailedForThisDraft = true;
      } else {
        summary.imagesDeleted++;
      }
    }

    // Retain the draft (retry next run) if any intended image delete failed, so we
    // never delete the row while its objects are still in storage (no orphans).
    if (imageFailedForThisDraft) continue;

    const { error: deleteError } = await client.from('campaign_drafts').delete().eq('id', draft.id);
    if (deleteError) {
      summary.draftFailures++;
      continue;
    }
    summary.draftsDeleted++;
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}
