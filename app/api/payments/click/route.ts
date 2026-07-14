import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmDonation } from '@/lib/payments/confirm';
import {
  createPaymentEvent,
  markPaymentProcessed,
  notifyAdminsOfPaymentIssue,
} from '@/lib/payments/helpers';
import {
  CLICK_ACTION_COMPLETE,
  CLICK_ACTION_PREPARE,
  ClickError,
  derivePrepareId,
  isClickConfigured,
  parseClickCallback,
  verifyClickSignature,
  type ClickCallbackParams,
} from '@/lib/payments/providers/click';

export const runtime = 'nodejs';

/**
 * Click SHOP API callback endpoint — Prepare (action=0) + Complete (action=1).
 *
 *   POST /api/payments/click   (application/x-www-form-urlencoded, MD5-signed)
 *
 * Configure this single URL as BOTH the Prepare and Complete URL in the Click
 * merchant cabinet (docs/click-setup.md). Click requires its own response
 * contract — always HTTP 200 with a JSON body carrying a spec-defined error
 * code — so this route exists alongside the generic /api/payments/webhook.
 *
 * Security / correctness properties (mirrors the generic webhook path):
 *   • Signature verified (MD5 per spec, timing-safe) before anything else — a
 *     bad signature is logged to payment_events and rejected (-1). Fail closed.
 *   • Every callback is logged to payment_events BEFORE processing (audit +
 *     reconciliation); provider_event_id = "<click_trans_id>:<action>" dedupes.
 *   • Idempotent: re-delivered Prepare returns the same deterministic
 *     merchant_prepare_id; re-delivered Complete answers -4 (already paid).
 *   • confirmDonation() is the single crediting path — amount AND currency are
 *     verified server-side; a definitive mismatch marks the donation failed and
 *     alerts admins (never credits, never leaves pending).
 */
export async function POST(request: Request) {
  // Click expects HTTP 200 + a JSON error code even for failures.
  const respond = (
    p: ClickCallbackParams | null,
    error: number,
    errorNote: string,
    ids?: { prepareId?: number; confirmId?: number }
  ) =>
    NextResponse.json({
      click_trans_id: p ? Number(p.click_trans_id) || p.click_trans_id : 0,
      merchant_trans_id: p?.merchant_trans_id ?? '',
      ...(ids?.prepareId != null ? { merchant_prepare_id: ids.prepareId } : {}),
      ...(ids?.confirmId != null ? { merchant_confirm_id: ids.confirmId } : {}),
      error,
      error_note: errorNote,
    });

  if (!isClickConfigured()) {
    return respond(null, ClickError.BadRequest, 'Click is not configured');
  }

  // ── Parse (Click sends application/x-www-form-urlencoded) ────────────────
  let params: ClickCallbackParams | null = null;
  try {
    params = parseClickCallback(await request.formData());
  } catch {
    /* fall through — treated as a bad request below */
  }
  if (!params) {
    return respond(null, ClickError.BadRequest, 'Missing or malformed parameters');
  }

  // ── Signature (fail closed) ───────────────────────────────────────────────
  if (
    params.service_id !== process.env.CLICK_SERVICE_ID ||
    !verifyClickSignature(params, process.env.CLICK_SECRET_KEY ?? '')
  ) {
    const rejectedId = await createPaymentEvent({
      provider: 'click',
      providerEventId: `${params.click_trans_id}:${params.action}`,
      paymentRef: params.merchant_trans_id,
      status: 'pending',
      rawPayload: { ...params, sign_string: '[redacted]' },
      signatureValid: false,
    });
    if (rejectedId) {
      await markPaymentProcessed(rejectedId, { signatureValid: false, errorMessage: 'invalid_signature' });
    }
    return respond(params, ClickError.SignCheckFailed, 'SIGN CHECK FAILED');
  }

  if (params.action !== CLICK_ACTION_PREPARE && params.action !== CLICK_ACTION_COMPLETE) {
    return respond(params, ClickError.ActionNotFound, 'Action not found');
  }

  // ── Resolve the donation by payment_ref (= transaction_param we sent) ─────
  const admin = createAdminClient();
  const { data: donation } = await admin
    .from('donations')
    .select('id, amount, status')
    .eq('payment_ref', params.merchant_trans_id)
    .maybeSingle();
  if (!donation) {
    return respond(params, ClickError.UserNotFound, 'Transaction param not found');
  }

  const prepareId = derivePrepareId(donation.id);

  // Log BEFORE processing (audit + reconciliation + dedupe key).
  const eventId = await createPaymentEvent({
    provider: 'click',
    providerEventId: `${params.click_trans_id}:${params.action}`,
    paymentRef: params.merchant_trans_id,
    donationId: donation.id,
    status: params.action === CLICK_ACTION_COMPLETE ? 'completed' : 'pending',
    amount: donation.amount,
    currency: 'UZS',
    rawPayload: { ...params, sign_string: '[redacted]' },
    signatureValid: true,
  });

  // ── Amount must match the recorded donation exactly (integer so'm) ────────
  const paidAmount = Number.parseFloat(params.amount);
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - donation.amount) >= 0.01) {
    if (eventId) {
      await markPaymentProcessed(eventId, { signatureValid: true, errorMessage: 'amount_mismatch' });
    }
    return respond(params, ClickError.IncorrectAmount, 'Incorrect parameter amount');
  }

  try {
    // ── Prepare (action=0): validate state, hand back our prepare id ────────
    if (params.action === CLICK_ACTION_PREPARE) {
      if (donation.status === 'completed') {
        return respond(params, ClickError.AlreadyPaid, 'Already paid');
      }
      if (donation.status !== 'pending') {
        return respond(params, ClickError.TransactionCancelled, 'Transaction cancelled');
      }
      if (eventId) await markPaymentProcessed(eventId, { signatureValid: true });
      return respond(params, ClickError.Success, 'Success', { prepareId });
    }

    // ── Complete (action=1) ──────────────────────────────────────────────────
    if (Number(params.merchant_prepare_id) !== prepareId) {
      return respond(params, ClickError.TransactionNotFound, 'Transaction does not exist');
    }

    // Click reports its own failure (donor cancelled / payment error): mark the
    // donation failed and acknowledge with -9 so Click closes the transaction.
    // confirmDonation only transitions pending rows, so a completed donation is
    // never un-credited here — answer -4 instead.
    if (Number(params.error) < 0) {
      const cancelOutcome = await confirmDonation(params.merchant_trans_id, 'failed');
      if (eventId) {
        await markPaymentProcessed(eventId, { signatureValid: true, errorMessage: `click_error_${params.error}` });
      }
      return cancelOutcome.status === 'noop' && cancelOutcome.reason === 'already_completed'
        ? respond(params, ClickError.AlreadyPaid, 'Already paid')
        : respond(params, ClickError.TransactionCancelled, 'Transaction cancelled');
    }

    const outcome = await confirmDonation(params.merchant_trans_id, 'completed', {
      amount: Math.round(paidAmount),
      currency: 'UZS',
    });

    if (outcome.status === 'noop') {
      // Idempotent re-delivery of Complete for a finalized donation.
      return outcome.reason === 'already_completed'
        ? respond(params, ClickError.AlreadyPaid, 'Already paid')
        : respond(params, ClickError.TransactionCancelled, 'Transaction cancelled');
    }

    if (outcome.status === 'failed') {
      // Definitive amount/currency mismatch — donation marked failed, never credited.
      if (eventId) {
        await markPaymentProcessed(eventId, { signatureValid: true, errorMessage: outcome.reason });
      }
      await notifyAdminsOfPaymentIssue({
        title: "To'lov mos kelmadi",
        body: `Click to'lovi rad etildi (${outcome.reason}). Ref: ${params.merchant_trans_id}.`,
        link: '/admin/donations',
      });
      return respond(params, ClickError.IncorrectAmount, 'Incorrect parameter amount');
    }

    if (eventId) await markPaymentProcessed(eventId, { signatureValid: true });
    return respond(params, ClickError.Success, 'Success', { confirmId: prepareId });
  } catch (err) {
    // DB/transient error → keep the event retryable (processed stays false) and
    // tell Click the update failed so it retries the callback.
    const message = err instanceof Error ? err.message : 'processing_failed';
    if (eventId) await markPaymentProcessed(eventId, { errorMessage: message });
    return respond(params, ClickError.FailedToUpdate, 'Failed to update transaction');
  }
}
