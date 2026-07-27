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
      // confirmDonation gates its UPDATE with .in('status', COMPLETABLE_STATUSES)
      // so a late callback can complete an EXPIRED donation while a duplicate
      // callback on a completed one still matches nothing.
      in: () => b,
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

describe('confirmDonation — late callbacks on EXPIRED donations', () => {
  // The expiry sweep relabels abandoned pending donations after 72h. That is
  // housekeeping, NOT a refusal of the money: if the provider really captured
  // the payment and its callback arrives late, the donation must still complete.
  it('completes an expired donation when a verified late callback arrives', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'expired' });
    useClient(client);
    const out = await confirmDonation('ref', 'completed', { amount: 50000, currency: 'UZS' });
    expect(out).toEqual({ status: 'completed' });
    // Exactly ONE update → apply_donation() credits campaign totals, donor count,
    // ledger and the owner notification exactly once.
    expect(updates).toEqual([{ status: 'completed' }]);
  });

  it('credits an expired donation only once even if the callback is re-delivered', async () => {
    // First delivery completes it...
    const first = mockAdmin({ id: 'd1', amount: 50000, status: 'expired' });
    useClient(first.client);
    expect(await confirmDonation('ref', 'completed', { amount: 50000, currency: 'UZS' })).toEqual({
      status: 'completed',
    });
    expect(first.updates).toHaveLength(1);

    // ...the re-delivery now sees 'completed', which is NOT completable → no-op.
    const second = mockAdmin({ id: 'd1', amount: 50000, status: 'completed' });
    useClient(second.client);
    expect(await confirmDonation('ref', 'completed', { amount: 50000, currency: 'UZS' })).toEqual({
      status: 'noop',
      reason: 'already_completed',
    });
    expect(second.updates).toHaveLength(0);
  });

  it('still refuses to credit an expired donation whose amount does not match', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'expired' });
    useClient(client);
    const out = await confirmDonation('ref', 'completed', { amount: 10, currency: 'UZS' });
    expect(out.status).toBe('failed');
    expect(updates).toEqual([{ status: 'failed' }]);
  });

  it('marks an expired donation failed when the provider reports failure', async () => {
    const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status: 'expired' });
    useClient(client);
    const out = await confirmDonation('ref', 'failed');
    expect(out).toEqual({ status: 'failed', reason: 'failed' });
    expect(updates).toEqual([{ status: 'failed' }]);
  });

  it('never resurrects a refunded or cancelled donation', async () => {
    for (const status of ['refunded', 'cancelled'] as const) {
      const { client, updates } = mockAdmin({ id: 'd1', amount: 50000, status });
      useClient(client);
      const out = await confirmDonation('ref', 'completed', { amount: 50000, currency: 'UZS' });
      expect(out).toEqual({ status: 'noop', reason: `already_${status}` });
      expect(updates).toHaveLength(0);
    }
  });
});
