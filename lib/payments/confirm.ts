import { createAdminClient } from '@/lib/supabase/admin';
import type { DonationStatus } from '@/types';
import type { PaymentStatus } from './types';
import { validatePaymentAmount, validateCurrency } from './helpers';

/**
 * Set a donation's final status by its payment reference. SERVER-ONLY.
 *
 * Only the service role can move a donation to 'completed' (clients are blocked
 * by RLS), which makes transaction records tamper-proof. The DB trigger
 * `apply_donation` credits current_amount / donors_count when status becomes
 * 'completed'.
 *
 * Idempotent: only a 'pending' donation transitions, so a re-delivered webhook
 * is a no-op. When `expected` is provided (real providers), the paid amount and
 * currency are verified server-side BEFORE crediting — on mismatch it throws and
 * campaign totals are never touched. Existing callers that omit `expected` keep
 * the prior behavior unchanged.
 */
export async function confirmDonation(
  reference: string,
  status: PaymentStatus = 'completed',
  expected?: { amount?: number; currency?: string }
): Promise<void> {
  const admin = createAdminClient();

  const { data: donation, error: fetchErr } = await admin
    .from('donations')
    .select('id, amount, status')
    .eq('payment_ref', reference)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!donation) throw new Error(`confirmDonation: no donation for payment_ref ${reference}`);

  // Idempotent — already finalized (e.g. duplicate webhook): do nothing.
  if (donation.status !== 'pending') return;

  // Server-side integrity verification before crediting real money.
  if (status === 'completed' && expected) {
    if (expected.amount != null && !validatePaymentAmount(expected.amount, donation.amount)) {
      throw new Error(
        `confirmDonation: amount mismatch (paid ${expected.amount}, expected ${donation.amount}) ref ${reference}`
      );
    }
    if (expected.currency != null && !validateCurrency(expected.currency)) {
      throw new Error(`confirmDonation: currency mismatch (${expected.currency}) ref ${reference}`);
    }
  }

  const { error } = await admin
    .from('donations')
    .update({ status: status as DonationStatus })
    .eq('payment_ref', reference)
    .eq('status', 'pending'); // re-assert pending — concurrency-safe
  if (error) throw new Error(error.message);
}
