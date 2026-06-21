import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Provider-independent payment helpers. Real gateways (Payme/Click/Uzum/…) reuse
 * these so a new integration only needs its API client + signature logic.
 * SERVER-ONLY (uses the service-role client).
 */

export const DEFAULT_CURRENCY = 'UZS';

/** Paid amount must exactly equal the recorded donation amount (integer so'm). */
export function validatePaymentAmount(paidAmount: number, expectedAmount: number): boolean {
  return Number.isInteger(paidAmount) && Number.isInteger(expectedAmount) && paidAmount === expectedAmount;
}

/** Currency must match the platform currency. */
export function validateCurrency(currency: string, expected = DEFAULT_CURRENCY): boolean {
  return typeof currency === 'string' && currency.trim().toUpperCase() === expected;
}

export interface PaymentEventInput {
  provider: string;
  providerEventId?: string | null;
  paymentRef?: string | null;
  donationId?: string | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  rawPayload?: Record<string, unknown> | null;
  signatureValid?: boolean | null;
}

/**
 * Log a webhook BEFORE processing (audit + reconciliation). Returns the row id
 * (or the existing row's id on a duplicate provider_event_id).
 */
export async function createPaymentEvent(input: PaymentEventInput): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payment_events')
    .insert({
      provider: input.provider,
      provider_event_id: input.providerEventId ?? null,
      payment_ref: input.paymentRef ?? null,
      donation_id: input.donationId ?? null,
      status: input.status ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      raw_payload: input.rawPayload ?? null,
      signature_valid: input.signatureValid ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Likely a unique violation (duplicate gateway event) — return the existing id.
    if (input.providerEventId) {
      const { data: existing } = await admin
        .from('payment_events')
        .select('id')
        .eq('provider', input.provider)
        .eq('provider_event_id', input.providerEventId)
        .maybeSingle();
      return existing?.id ?? null;
    }
    return null;
  }
  return data?.id ?? null;
}

/** True if this gateway event was already processed — the core idempotency check. */
export async function isDuplicateWebhook(provider: string, providerEventId?: string | null): Promise<boolean> {
  if (!providerEventId) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider', provider)
    .eq('provider_event_id', providerEventId)
    .eq('processed', true)
    .maybeSingle();
  return !!data;
}

/**
 * Finalize a logged event. On success → processed=true; on error → keep
 * processed=false (so a retry can re-process) but record the reason + timestamp.
 */
export async function markPaymentProcessed(
  id: string,
  opts?: { signatureValid?: boolean; errorMessage?: string | null }
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('payment_events')
    .update({
      processed: !opts?.errorMessage,
      processed_at: new Date().toISOString(),
      ...(opts?.signatureValid != null ? { signature_valid: opts.signatureValid } : {}),
      ...(opts?.errorMessage != null ? { error_message: opts.errorMessage } : {}),
    })
    .eq('id', id);
}
