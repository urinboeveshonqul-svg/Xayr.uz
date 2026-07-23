import type { CampaignCategory, CampaignDraft } from '@/types';

/**
 * Campaign-draft helpers. Drafts are auto-saved, private work-in-progress rows
 * (public.campaign_drafts) that hold the partial create-form state. On submit
 * the draft is mapped to the EXISTING /api/campaigns/create payload and the row
 * is deleted — no campaign creation logic is duplicated here.
 *
 * These functions are pure (no I/O) so they can be unit-tested and shared by the
 * form (auto-save gating, submit mapping) and the drafts list (submittable badge).
 */

// The create-form field shape the auto-saver observes.
export interface DraftFormValues {
  title?: string | null;
  description?: string | null;
  story?: string | null;
  category?: string | null;
  goal?: number | null;
  location?: string | null;
  deadline?: string | null;
  is_urgent?: boolean;
  image_url?: string | null;
  images?: string[];
  video_url?: string | null;
}

// Minimums mirrored from the create route's zod schema (app/api/campaigns/create).
export const DRAFT_LIMITS = {
  titleMin: 10,
  descriptionMin: 30,
  goalMin: 100_000,
} as const;

const CATEGORIES: readonly CampaignCategory[] = [
  'medical', 'education', 'disaster', 'community', 'environment', 'animal', 'sport', 'other',
];

const nonEmpty = (s: string | null | undefined): boolean => !!s && s.trim().length > 0;

/**
 * True when the form holds enough to be worth persisting as a draft. Prevents a
 * completely empty form (or a first mount) from creating a stray draft row.
 */
export function hasDraftContent(v: DraftFormValues): boolean {
  return (
    nonEmpty(v.title) ||
    nonEmpty(v.description) ||
    nonEmpty(v.story) ||
    nonEmpty(v.location) ||
    nonEmpty(v.video_url) ||
    !!v.image_url ||
    (v.images?.length ?? 0) > 0 ||
    (v.goal ?? 0) > 0
  );
}

/** The columns persisted to public.campaign_drafts for a set of form values. */
export function draftColumns(v: DraftFormValues) {
  return {
    title: nonEmpty(v.title) ? v.title!.trim() : null,
    description: nonEmpty(v.description) ? v.description!.trim() : null,
    story: nonEmpty(v.story) ? v.story!.trim() : null,
    category: v.category || null,
    goal_amount: v.goal && v.goal > 0 ? Math.floor(v.goal) : null,
    location: nonEmpty(v.location) ? v.location!.trim() : null,
    deadline: v.deadline || null,
    is_urgent: !!v.is_urgent,
    image_url: v.image_url || null,
    images: v.images ?? [],
    video_url: nonEmpty(v.video_url) ? v.video_url!.trim() : null,
  };
}

export interface CreateCampaignPayload {
  title: string;
  description: string;
  story: string | null;
  category: CampaignCategory;
  goal: number;
  location: string | null;
  deadline: string | null;
  is_urgent: boolean;
  image_url: string;
  images: string[];
  // Optional Instagram post/reel permalink (validated server-side); null = none.
  video_url: string | null;
}

/**
 * Map a saved draft to the /api/campaigns/create payload. Returns null when the
 * draft does not yet satisfy the create route's requirements (so it cannot be
 * submitted) — the single source of truth for "is this draft submittable".
 */
export function draftToCreatePayload(d: CampaignDraft): CreateCampaignPayload | null {
  const title = d.title?.trim() ?? '';
  const description = d.description?.trim() ?? '';
  const goal = d.goal_amount ?? 0;
  const category = d.category as CampaignCategory | null;

  if (title.length < DRAFT_LIMITS.titleMin) return null;
  if (description.length < DRAFT_LIMITS.descriptionMin) return null;
  if (goal < DRAFT_LIMITS.goalMin) return null;
  if (!category || !CATEGORIES.includes(category)) return null;
  if (!d.image_url) return null;

  return {
    title,
    description,
    story: d.story?.trim() || null,
    category,
    goal,
    location: d.location?.trim() || null,
    deadline: d.deadline || null,
    is_urgent: !!d.is_urgent,
    image_url: d.image_url,
    images: d.images ?? [],
    video_url: d.video_url ?? null,
  };
}

/** Whether a draft has all fields required to become a Pending Review campaign. */
export function isDraftSubmittable(d: CampaignDraft): boolean {
  return draftToCreatePayload(d) !== null;
}

/** A human label for a draft row (falls back when the title is still empty). */
export function draftDisplayTitle(d: CampaignDraft, fallback: string): string {
  return nonEmpty(d.title) ? d.title!.trim() : fallback;
}
