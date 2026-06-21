import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { confirmDonation } from '@/lib/payments/confirm';
import { createPaymentEvent, isDuplicateWebhook, markPaymentProcessed } from '@/lib/payments/helpers';

export const runtime = 'nodejs';

/**
 * Gateway webhook endpoint (provider-agnostic).
 *
 *   POST /api/payments/webhook?provider=click
 *
 * Real providers implement verifyWebhook() (signature check + parse). The flow:
 *   1. verify + parse        → WebhookResult { reference, status, amount, currency, providerEventId, raw }
 *   2. idempotency           → ignore a re-delivered event (ack success)
 *   3. log BEFORE processing → payment_events row (audit + reconciliation)
 *   4. confirmDonation       → verifies amount/currency, credits once
 *   5. mark processed        → success, or record the error (kept retryable)
 *
 * No gateway is wired yet, so unknown/manual providers return 501 — the path
 * below is dormant until a provider class with verifyWebhook is registered.
 * Internal errors are never leaked to the caller.
 */
export async function POST(request: Request) {
  const providerId = new URL(request.url).searchParams.get('provider');
  const provider = getPaymentProvider(providerId);

  if (!provider.verifyWebhook) {
    return NextResponse.json({ error: 'Payment provider not configured' }, { status: 501 });
  }

  let result;
  try {
    result = await provider.verifyWebhook(request);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  // Idempotency — re-delivered event: acknowledge without re-processing.
  if (await isDuplicateWebhook(provider.id, result.providerEventId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Log every webhook before touching the donation.
  const eventId = await createPaymentEvent({
    provider: provider.id,
    providerEventId: result.providerEventId,
    paymentRef: result.reference,
    status: result.status,
    amount: result.amount,
    currency: result.currency,
    rawPayload: (result.raw as Record<string, unknown>) ?? null,
    signatureValid: result.signatureValid ?? true,
  });

  try {
    await confirmDonation(result.reference, result.status, {
      amount: result.amount,
      currency: result.currency,
    });
    if (eventId) await markPaymentProcessed(eventId, { signatureValid: result.signatureValid ?? true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'processing_failed';
    if (eventId) await markPaymentProcessed(eventId, { errorMessage: message });
    return NextResponse.json({ error: 'processing_failed' }, { status: 400 });
  }
}
