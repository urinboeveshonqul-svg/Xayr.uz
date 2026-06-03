import { createAdminClient } from '@/lib/supabase/admin';
import type { DonationStatus } from '@/types';
import type { PaymentStatus } from './types';

/**
 * Set a donation's final status by its payment reference. SERVER-ONLY.
 *
 * Only the service role can move a donation to 'completed' (clients are blocked
 * by RLS), which is what makes transaction records tamper-proof. The DB trigger
 * `apply_donation` credits the campaign's current_amount / donors_count when the
 * status becomes 'completed'.
 */
export async function confirmDonation(
  reference: string,
  status: PaymentStatus = 'completed'
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('donations')
    .update({ status: status as DonationStatus })
    .eq('payment_ref', reference)
    .eq('status', 'pending'); // idempotent: only a pending donation can transition
  if (error) throw new Error(error.message);
}
