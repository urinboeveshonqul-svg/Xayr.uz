import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { confirmDonation } from '@/lib/payments/confirm';
import {
  createPaymentEvent,
  isDuplicateWebhook,
  markPaymentProcessed,
  notifyAdminsOfPaymentIssue,
} from '@/lib/payments/helpers';

export const runtime = 'nodejs';

/**
 * Gateway webhook endpoint (provider-agnostic).
 *
 *   POST /api/payments/webhook?provider=click
 *
 * Real providers implement verifyWebhook() (signature check + parse). The flow:
 *   1. verify + parse        → WebhookResult { reference, status, amount, currency, signatureValid, providerEventId, raw }
 *   2. signature enforcement → reject + log when signatureValid === false (fail closed)
 *   3. idempotency           → ignore a re-delivered event (ack success)
 *   4. log BEFORE processing → payment_events row (audit + reconciliation)
 *   5. confirmDonation       → verifies amount/currency (mandatory), credits once
 *   6. mismatch handling     → mark failed + alert admins; never leave pending
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

  // M1 — SIGNATURE ENFORCEMENT (fail closed). Never assume verifyWebhook threw:
  // explicitly reject when the signature did not validate. Log the attempt for
  // audit, but never call confirmDonation.
  if (result.signatureValid === false) {
    const rejectedId = await createPaymentEvent({
      provider: provider.id,
      providerEventId: result.providerEventId,
      paymentRef: result.reference,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      rawPayload: (result.raw as Record<string, unknown>) ?? null,
      signatureValid: false,
    });
    if (rejectedId) {
      await markPaymentProcessed(rejectedId, { signatureValid: false, errorMessage: 'invalid_signature' });
    }
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  // Idempotency — re-delivered event: acknowledge without re-processing.
  if (await isDuplicateWebhook(provider.id, result.providerEventId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Log every webhook before touching the donation. signature_valid is recorded
  // exactly as reported (no optimistic default).
  const eventId = await createPaymentEvent({
    provider: provider.id,
    providerEventId: result.providerEventId,
    paymentRef: result.reference,
    status: result.status,
    amount: result.amount,
    currency: result.currency,
    rawPayload: (result.raw as Record<string, unknown>) ?? null,
    signatureValid: result.signatureValid ?? null,
  });

  try {
    const outcome = await confirmDonation(result.reference, result.status, {
      amount: result.amount,
      currency: result.currency,
    });

    // M5 — provider claimed success but amount/currency didn't match. The
    // donation was marked failed (never credited); flag the event + alert admins.
    if (outcome.status === 'failed' && result.status === 'completed') {
      if (eventId) {
        await markPaymentProcessed(eventId, {
          signatureValid: result.signatureValid,
          errorMessage: outcome.reason,
        });
      }
      await notifyAdminsOfPaymentIssue({
        title: "To'lov mos kelmadi",
        body: `To'lov rad etildi (${outcome.reason}). Ref: ${result.reference}.`,
        link: '/admin/donations',
      });
      // Acknowledge (200) so the gateway doesn't retry-storm — the donation is
      // definitively resolved as failed.
      return NextResponse.json({ ok: false, status: 'failed', reason: 'mismatch' });
    }

    if (eventId) await markPaymentProcessed(eventId, { signatureValid: result.signatureValid });
    return NextResponse.json({ ok: true, status: outcome.status });
  } catch (err) {
    // Missing data / DB error → keep retryable (processed stays false).
    const message = err instanceof Error ? err.message : 'processing_failed';
    if (eventId) await markPaymentProcessed(eventId, { errorMessage: message });
    return NextResponse.json({ error: 'processing_failed' }, { status: 400 });
  }
}
