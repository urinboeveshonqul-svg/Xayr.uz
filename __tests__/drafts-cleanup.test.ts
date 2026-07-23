import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types';
import {
  cleanupAbandonedDrafts,
  storagePathFromPublicUrl,
  draftImageUrls,
  CAMPAIGN_IMAGE_BUCKET,
} from '@/lib/drafts/cleanup';

// ── Test doubles ────────────────────────────────────────────────────────────
// A minimal in-memory fake of the exact Supabase call shapes the cleanup service
// uses: from('campaign_drafts'|'campaigns') → select/lt/order/limit/eq/neq/
// contains + delete().eq(), and storage.from(bucket).remove([path]).

const PREFIX = 'https://proj.supabase.co/storage/v1/object/public/campaign-images/';
const img = (name: string) => `${PREFIX}${name}`;

interface DraftRow {
  id: string;
  user_id: string;
  image_url: string | null;
  images: string[];
  updated_at: string;
}
interface CampaignRow {
  id: string;
  image_url: string | null;
  images: string[];
}

interface FakeOpts {
  failStoragePaths?: Set<string>; // remove() errors for these object paths
  failDraftDeleteIds?: Set<string>; // delete() errors for these draft ids
}

class QueryBuilder {
  private filters: Array<['eq' | 'neq' | 'lt', string, unknown]> = [];
  private containsFilter: [string, unknown[]] | null = null;
  private op: 'select' | 'delete' = 'select';
  private limitN = Infinity;

  constructor(
    private rows: Array<Record<string, unknown>>,
    private onDelete: (ids: string[]) => { error: unknown },
  ) {}

  select() { this.op = 'select'; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filters.push(['eq', c, v]); return this; }
  neq(c: string, v: unknown) { this.filters.push(['neq', c, v]); return this; }
  lt(c: string, v: unknown) { this.filters.push(['lt', c, v]); return this; }
  contains(c: string, arr: unknown[]) { this.containsFilter = [c, arr]; return this; }
  order() { return this; }
  limit(n: number) { this.limitN = n; return this; }

  private match(): Array<Record<string, unknown>> {
    return this.rows.filter((row) => {
      for (const [kind, col, val] of this.filters) {
        const cell = row[col];
        if (kind === 'eq' && cell !== val) return false;
        if (kind === 'neq' && cell === val) return false;
        if (kind === 'lt' && !(String(cell) < String(val))) return false;
      }
      if (this.containsFilter) {
        const [col, arr] = this.containsFilter;
        const cell = row[col] as unknown[] | undefined;
        if (!Array.isArray(cell)) return false;
        if (!arr.every((x) => cell.includes(x))) return false;
      }
      return true;
    });
  }

  then(resolve: (r: { data: Array<Record<string, unknown>> | null; error: unknown }) => void) {
    if (this.op === 'delete') {
      const matched = this.match();
      const { error } = this.onDelete(matched.map((r) => r.id as string));
      resolve({ data: error ? null : matched, error });
      return;
    }
    resolve({ data: this.match().slice(0, this.limitN), error: null });
  }
}

function makeFakeClient(
  drafts: DraftRow[],
  campaigns: CampaignRow[],
  opts: FakeOpts = {},
) {
  const storageRemoved: string[] = [];
  const draftStore = [...drafts];

  const client = {
    from(table: string) {
      const rows = table === 'campaign_drafts' ? draftStore : campaigns;
      return new QueryBuilder(rows as unknown as Array<Record<string, unknown>>, (ids) => {
        if (table !== 'campaign_drafts') return { error: null };
        if (ids.some((id) => opts.failDraftDeleteIds?.has(id))) return { error: { message: 'db down' } };
        for (const id of ids) {
          const idx = draftStore.findIndex((d) => d.id === id);
          if (idx !== -1) draftStore.splice(idx, 1);
        }
        return { error: null };
      });
    },
    storage: {
      from(bucket: string) {
        expect(bucket).toBe(CAMPAIGN_IMAGE_BUCKET);
        return {
          async remove(paths: string[]) {
            for (const p of paths) {
              if (opts.failStoragePaths?.has(p)) return { data: null, error: { message: 'storage error' } };
              storageRemoved.push(p);
            }
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, storageRemoved, draftStore };
}

const NOW = new Date('2026-08-01T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

// ── Pure helpers ────────────────────────────────────────────────────────────
describe('storagePathFromPublicUrl', () => {
  it('extracts the object path for our bucket', () => {
    expect(storagePathFromPublicUrl(img('u1/cover.jpg'))).toBe('u1/cover.jpg');
  });
  it('returns null for a foreign / non-bucket URL', () => {
    expect(storagePathFromPublicUrl('https://evil.example/x.jpg')).toBeNull();
    expect(storagePathFromPublicUrl('https://proj.supabase.co/storage/v1/object/public/profile-photos/a.jpg')).toBeNull();
  });
  it('strips a query string', () => {
    expect(storagePathFromPublicUrl(img('u1/a.jpg?token=abc'))).toBe('u1/a.jpg');
  });
});

describe('draftImageUrls', () => {
  it('dedupes cover + gallery and drops empties', () => {
    expect(draftImageUrls({ image_url: img('a'), images: [img('a'), img('b')] })).toEqual([img('a'), img('b')]);
    expect(draftImageUrls({ image_url: null, images: [] })).toEqual([]);
  });
});

// ── Service behavior ────────────────────────────────────────────────────────
describe('cleanupAbandonedDrafts', () => {
  it('deletes a draft older than 30 days and its orphaned image', async () => {
    const { client, storageRemoved, draftStore } = makeFakeClient(
      [{ id: 'd1', user_id: 'u1', image_url: img('u1/cover.jpg'), images: [], updated_at: daysAgo(31) }],
      [],
    );
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.draftsScanned).toBe(1);
    expect(s.draftsDeleted).toBe(1);
    expect(s.imagesDeleted).toBe(1);
    expect(s.imagesSkipped).toBe(0);
    expect(storageRemoved).toEqual(['u1/cover.jpg']);
    expect(draftStore).toHaveLength(0);
  });

  it('does NOT touch a draft newer than 30 days', async () => {
    const { client, storageRemoved, draftStore } = makeFakeClient(
      [{ id: 'd_new', user_id: 'u1', image_url: img('u1/new.jpg'), images: [], updated_at: daysAgo(5) }],
      [],
    );
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.draftsScanned).toBe(0);
    expect(s.draftsDeleted).toBe(0);
    expect(s.imagesDeleted).toBe(0);
    expect(storageRemoved).toEqual([]);
    expect(draftStore).toHaveLength(1);
  });

  it('keeps an image still referenced by another (newer) draft, but deletes the draft row', async () => {
    const shared = img('u1/shared.jpg');
    const { client, storageRemoved, draftStore } = makeFakeClient(
      [
        { id: 'd_old', user_id: 'u1', image_url: shared, images: [], updated_at: daysAgo(40) },
        { id: 'd_new', user_id: 'u1', image_url: shared, images: [], updated_at: daysAgo(2) },
      ],
      [],
    );
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.draftsScanned).toBe(1); // only the old one is in range
    expect(s.draftsDeleted).toBe(1);
    expect(s.imagesDeleted).toBe(0);
    expect(s.imagesSkipped).toBe(1); // shared image kept
    expect(storageRemoved).toEqual([]);
    expect(draftStore.map((d) => d.id)).toEqual(['d_new']);
  });

  it('never deletes an image referenced by a campaign', async () => {
    const used = img('u1/used-by-campaign.jpg');
    const { client, storageRemoved } = makeFakeClient(
      [{ id: 'd1', user_id: 'u1', image_url: used, images: [], updated_at: daysAgo(60) }],
      [{ id: 'c1', image_url: null, images: [used] }], // referenced via campaign.images[]
    );
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.imagesDeleted).toBe(0);
    expect(s.imagesSkipped).toBe(1);
    expect(s.draftsDeleted).toBe(1); // the draft row still goes away
    expect(storageRemoved).toEqual([]);
  });

  it('retains the draft when a storage delete fails (no orphan), and reports it', async () => {
    const { client, storageRemoved, draftStore } = makeFakeClient(
      [{ id: 'd1', user_id: 'u1', image_url: img('u1/boom.jpg'), images: [], updated_at: daysAgo(45) }],
      [],
      { failStoragePaths: new Set(['u1/boom.jpg']) },
    );
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.imageFailures).toBe(1);
    expect(s.imagesDeleted).toBe(0);
    expect(s.draftsDeleted).toBe(0); // retained for retry
    expect(storageRemoved).toEqual([]);
    expect(draftStore).toHaveLength(1);
  });

  it('reports a draft-row delete failure and continues to the next draft', async () => {
    const { client, storageRemoved, draftStore } = makeFakeClient(
      [
        { id: 'd_fail', user_id: 'u1', image_url: null, images: [], updated_at: daysAgo(31) },
        { id: 'd_ok', user_id: 'u2', image_url: img('u2/ok.jpg'), images: [], updated_at: daysAgo(32) },
      ],
      [],
      { failDraftDeleteIds: new Set(['d_fail']) },
    );
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.draftsScanned).toBe(2);
    expect(s.draftFailures).toBe(1);
    expect(s.draftsDeleted).toBe(1); // d_ok still processed
    expect(storageRemoved).toEqual(['u2/ok.jpg']);
    expect(draftStore.map((d) => d.id)).toEqual(['d_fail']); // the failed one remains
  });

  it('reports a positive execution time', async () => {
    const { client } = makeFakeClient([], []);
    const s = await cleanupAbandonedDrafts(client, { now: NOW });
    expect(s.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof s.durationMs).toBe('number');
  });
});
