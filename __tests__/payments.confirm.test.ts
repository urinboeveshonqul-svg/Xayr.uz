import { describe, it, expect, vi, beforeEach } from 'vitest';

// confirmDonation() is the SINGLE crediting path. Mock the service-role client so
// we can drive it deterministically with no database. The mock is a minimal
// chainable stand-in: reads resolve via .maybeSingle(); the update chain is
// awaited directly (thenable), and we capture the payload to assert what status
// the donation was moved to (and that it happened at most once).
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { confirmDonation } from '@/lib/payments/confirm';

type DonationRow = { id: string; amount: number; status: string };

function mockAdmin(
  donation: DonationRow | null,
  opts: { fetchError?: unknown; updateError?: unknown } = {}
) {
  const updates: Array<Record<string, unknown>> = [];
  const from = () => {
    let payload: Record<string, unknown> | undefined;
    const b = {
      select: () => b,
      update: (p: Record<string, unknown>) => {
        payload = p;
        return b;
      },
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: donation, error: opts.fetchError ?? null }),
      // Only the awaited update chain reaches here.
      then: (resolve: (v: { error: unknown }) => unknown, reject?: (e: unknown) => unknown) => {
        if (payload !== undefined) updates.push(payload);
        return Promise.resolve({ error: opts.updateError ?? null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { client: { from }, updates };
}

const mocked = vi.mocked(createAdminClient);
const useClient = (client: { from: () => unknown }) =>
  mocked.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

beforeEach(() => {
  mocked.mockReset();
});

describe('confirmDonation — idempotency', () => {
  it('no-ops on an already-completed donation (re-delivered webhook)', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'completed' });
    useClient(client);
    const out = await confirmDonation('ref', 'completed', { amount: 50000, currency: 'UZS' });
    expect(out).toEqual({ status: 'noop', reason: 'already_completed' });
    expect(updates).toHaveLength(0);
  });

  it('no-ops on a re-delivered failure for an already-failed donation', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'failed' });
    useClient(client);
    const out = await confirmDonation('ref', 'failed');
    expect(out).toEqual({ status: 'noop', reason: 'already_failed' });
    expect(updates).toHaveLength(0);
  });
});

describe('confirmDonation — amount / currency verification', () => {
  it('fails CLOSED (throws) when amount/currency are missing on a completion', async () => {
    const { client } = mockAdmin({ id: 'd1', amount: 50000, status: 'pending' });
    useClient(client);
    await expect(confirmDonation('ref', 'completed')).rejects.toThrow();
  });

  it('marks failed (never credits) on an amount mismatch', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'pending' });
    useClient(client);
    const out = await confirmDonation('ref', 'completed', { amount: 40000, currency: 'UZS' });
    expect(out.status).toBe('failed');
    expect((out as { reason: string }).reason).toContain('amount_mismatch');
    expect(updates).toEqual([{ status: 'failed' }]);
  });

  it('marks failed on a currency mismatch', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'pending' });
    useClient(client);
    const out = await confirmDonation('ref', 'completed', { amount: 50000, currency: 'USD' });
    expect(out.status).toBe('failed');
    expect((out as { reason: string }).reason).toContain('currency_mismatch');
    expect(updates).toEqual([{ status: 'failed' }]);
  });
});

describe('confirmDonation — happy paths', () => {
  it('credits a verified completion exactly once', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'pending' });
    useClient(client);
    const out = await confirmDonation('ref', 'completed', { amount: 50000, currency: 'UZS' });
    expect(out).toEqual({ status: 'completed' });
    expect(updates).toEqual([{ status: 'completed' }]);
  });

  it('marks a pending donation failed on a provider-reported failure', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'pending' });
    useClient(client);
    const out = await confirmDonation('ref', 'failed');
    expect(out).toEqual({ status: 'failed', reason: 'failed' });
    expect(updates).toEqual([{ status: 'failed' }]);
  });

  it('throws when the payment reference resolves to no donation', async () => {
    const { client } = mockAdmin(null);
    useClient(client);
    await expect(confirmDonation('missing', 'completed', { amount: 1, currency: 'UZS' })).rejects.toThrow();
  });
});
