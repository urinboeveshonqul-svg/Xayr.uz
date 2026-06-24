import { createAdminClient } from '@/lib/supabase/admin';
import type { DonationStatus } from '@/types';
import type { PaymentStatus } from './types';
import { validatePaymentAmount, validateCurrency } from './helpers';

/**
 * Result of a confirmation attempt.
 *  - `completed` — donation credited.
 *  - `failed`    — donation marked failed (provider-reported failure, OR an
 *                  amount/currency mismatch that must never credit — see `reason`).
 *  - `noop`      — already finalized (idempotent re-delivery).
 */
export type ConfirmOutcome =
  | { status: 'completed' }
  | { status: 'failed'; reason: string }
  | { status: 'noop'; reason: string };

/**
 * Set a donation's final status by its payment reference. SERVER-ONLY.
 *
 * Only the service role can move a donation to 'completed' (clients are blocked
 * by RLS), which makes transaction records tamper-proof. The DB trigger
 * `apply_donation` credits current_amount / donors_count when status becomes
 * 'completed' (and reverses it if a completed donation is later refunded/failed).
 *
 * Money-loss hardening:
 *  - Idempotent: only a 'pending' donation transitions (re-delivered webhook =
 *    no-op), enforced again by the `WHERE status='pending'` update.
 *  - M2: amount AND currency are MANDATORY to complete. If either is missing it
 *    FAILS CLOSED (throws; the donation stays pending and the webhook is
 *    retryable) — a donation is NEVER credited without a verified amount.
 *  - M5: if amount/currency are present but DON'T match, the donation is marked
 *    'failed' (not left pending). The caller logs the event + alerts an admin.
 */
export async function confirmDonation(
  reference: string,
  status: PaymentStatus = 'completed',
  expected?: { amount?: number; currency?: string }
): Promise<ConfirmOutcome> {
  const admin = createAdminClient();

  // The payment reference must resolve to a known donation.
  const { data: donation, error: fetchErr } = await admin
    .from('donations')
    .select('id, amount, status')
    .eq('payment_ref', reference)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!donation) throw new Error(`confirmDonation: no donation for payment_ref ${reference}`);

  // Idempotent — already finalized (duplicate webhook / retry): do nothing.
  if (donation.status !== 'pending') {
    return { status: 'noop', reason: `already_${donation.status}` };
  }

  if (status === 'completed') {
    // M2 — mandatory verification. Missing amount/currency → fail closed.
    const paidAmount = expected?.amount;
    const paidCurrency = expected?.currency;
    if (paidAmount == null || paidCurrency == null) {
      throw new Error(
        `confirmDonation: amount and currency are required to complete ref ${reference} (got amount=${paidAmount ?? 'null'}, currency=${paidCurrency ?? 'null'})`
      );
    }

    const amountOk = validatePaymentAmount(paidAmount, donation.amount);
    const currencyOk = validateCurrency(paidCurrency);

    // M5 — definitive mismatch: mark failed, never credit, never leave pending.
    if (!amountOk || !currencyOk) {
      const reason = !amountOk
        ? `amount_mismatch(paid=${paidAmount}, expected=${donation.amount})`
        : `currency_mismatch(${paidCurrency})`;
      await admin
        .from('donations')
        .update({ status: 'failed' as DonationStatus })
        .eq('payment_ref', reference)
        .eq('status', 'pending');
      return { status: 'failed', reason };
    }
  }

  // Apply the final status. Re-assert pending → concurrency-safe + idempotent.
  const { error } = await admin
    .from('donations')
    .update({ status: status as DonationStatus })
    .eq('payment_ref', reference)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  return status === 'completed' ? { status: 'completed' } : { status: 'failed', reason: status };
}
