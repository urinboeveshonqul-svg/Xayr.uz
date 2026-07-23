import { describe, it, expect } from 'vitest';
import {
  hasDraftContent,
  draftColumns,
  draftToCreatePayload,
  isDraftSubmittable,
  draftDisplayTitle,
  DRAFT_LIMITS,
  type DraftFormValues,
} from '@/lib/drafts';
import type { CampaignDraft } from '@/types';

// A fully-valid, submittable draft; individual tests override single fields.
function makeDraft(overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    id: 'd1',
    user_id: 'u1',
    title: 'Help build a school in the village',
    description: 'We are raising funds to build a small primary school for kids.',
    story: null,
    category: 'education',
    goal_amount: 5_000_000,
    location: null,
    deadline: null,
    is_urgent: false,
    image_url: 'https://x.supabase.co/storage/v1/object/public/campaign-images/u1/cover.jpg',
    images: [],
    video_url: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
    ...overrides,
  };
}

describe('hasDraftContent — auto-save gating (draft creation)', () => {
  it('is false for a completely empty form', () => {
    expect(hasDraftContent({})).toBe(false);
    expect(hasDraftContent({ title: '', description: '   ', is_urgent: false, images: [] })).toBe(false);
  });

  it('is true once any meaningful field is filled', () => {
    expect(hasDraftContent({ title: 'A' })).toBe(true);
    expect(hasDraftContent({ description: 'x' })).toBe(true);
    expect(hasDraftContent({ story: 'story' })).toBe(true);
    expect(hasDraftContent({ location: 'Tashkent' })).toBe(true);
    expect(hasDraftContent({ goal: 100 })).toBe(true);
    expect(hasDraftContent({ image_url: 'https://x/img.jpg' })).toBe(true);
    expect(hasDraftContent({ images: ['https://x/1.jpg'] })).toBe(true);
  });

  it('ignores is_urgent alone (a default toggle is not content)', () => {
    expect(hasDraftContent({ is_urgent: true })).toBe(false);
  });

  it('treats goal 0 / negative as empty', () => {
    expect(hasDraftContent({ goal: 0 })).toBe(false);
    expect(hasDraftContent({ goal: -5 })).toBe(false);
  });
});

describe('draftColumns — persisted shape (editing / auto-save)', () => {
  it('trims strings and nulls out empties', () => {
    const v: DraftFormValues = {
      title: '  Title  ',
      description: '',
      story: '   ',
      category: 'medical',
      goal: 250_000.9,
      location: '  Samarkand ',
      deadline: '2026-09-01',
      is_urgent: true,
      image_url: 'https://x/cover.jpg',
      images: ['https://x/1.jpg', 'https://x/2.jpg'],
    };
    expect(draftColumns(v)).toEqual({
      title: 'Title',
      description: null,
      story: null,
      category: 'medical',
      goal_amount: 250_000, // floored
      location: 'Samarkand',
      deadline: '2026-09-01',
      is_urgent: true,
      image_url: 'https://x/cover.jpg',
      images: ['https://x/1.jpg', 'https://x/2.jpg'],
      video_url: null,
    });
  });

  it('defaults images to [] and is_urgent to false', () => {
    expect(draftColumns({ title: 'x' })).toMatchObject({ images: [], is_urgent: false, goal_amount: null });
  });
});

describe('draftToCreatePayload / isDraftSubmittable (submission conversion)', () => {
  it('maps a complete draft to the create-route payload', () => {
    const d = makeDraft({ story: '  once upon a time  ', images: ['https://x/1.jpg'] });
    const payload = draftToCreatePayload(d);
    expect(payload).not.toBeNull();
    expect(payload).toEqual({
      title: d.title,
      description: d.description,
      story: 'once upon a time',
      category: 'education',
      goal: 5_000_000,
      location: null,
      deadline: null,
      is_urgent: false,
      image_url: d.image_url,
      images: ['https://x/1.jpg'],
      video_url: null,
    });
    expect(isDraftSubmittable(d)).toBe(true);
  });

  it('rejects a title shorter than the minimum', () => {
    const d = makeDraft({ title: 'short' });
    expect(d.title!.length).toBeLessThan(DRAFT_LIMITS.titleMin);
    expect(draftToCreatePayload(d)).toBeNull();
    expect(isDraftSubmittable(d)).toBe(false);
  });

  it('rejects a description shorter than the minimum', () => {
    expect(isDraftSubmittable(makeDraft({ description: 'too short' }))).toBe(false);
  });

  it('rejects a goal below the platform minimum', () => {
    expect(isDraftSubmittable(makeDraft({ goal_amount: DRAFT_LIMITS.goalMin - 1 }))).toBe(false);
    expect(isDraftSubmittable(makeDraft({ goal_amount: null }))).toBe(false);
  });

  it('rejects a missing / unknown category', () => {
    expect(isDraftSubmittable(makeDraft({ category: null }))).toBe(false);
    expect(isDraftSubmittable(makeDraft({ category: 'nonsense' }))).toBe(false);
  });

  it('rejects a draft with no cover image', () => {
    expect(isDraftSubmittable(makeDraft({ image_url: null }))).toBe(false);
  });

  it('defaults a missing images array to [] in the payload', () => {
    const payload = draftToCreatePayload(makeDraft({ images: undefined as unknown as string[] }));
    expect(payload?.images).toEqual([]);
  });
});

describe('draftDisplayTitle (resume / list rendering)', () => {
  it('returns the trimmed title when present', () => {
    expect(draftDisplayTitle(makeDraft({ title: '  My draft ' }), 'Untitled')).toBe('My draft');
  });

  it('falls back when the title is empty or whitespace', () => {
    expect(draftDisplayTitle(makeDraft({ title: null }), 'Untitled')).toBe('Untitled');
    expect(draftDisplayTitle(makeDraft({ title: '   ' }), 'Untitled')).toBe('Untitled');
  });
});
