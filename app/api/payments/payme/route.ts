import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmDonation } from '@/lib/payments/confirm';
import { createPaymentEvent, markPaymentProcessed } from '@/lib/payments/helpers';
import {
  PAYME_TRANSACTION_TIMEOUT_MS,
  PaymeError,
  PaymeState,
  isPaymeConfigured,
  somToTiyin,
  verifyPaymeAuth,
} from '@/lib/payments/providers/payme';
import type { DonationStatus } from '@/types';

export const runtime = 'nodejs';

/**
 * Payme Merchant API endpoint — JSON-RPC 2.0, driven BY Payme (server-to-server).
 *
 *   POST /api/payments/payme   (HTTP Basic auth: password = merchant KEY)
 *
 * Methods: CheckPerformTransaction, CreateTransaction, PerformTransaction,
 * CancelTransaction, CheckTransaction, GetStatement.
 *
 * Security / correctness properties (mirrors the Click callback route):
 *   • Auth verified timing-safe before anything else; failures answer -32504.
 *   • Amount verified in tiyin against the recorded donation — the client/gateway
 *     amount is never trusted (-31001 on mismatch).
 *   • Idempotent state machine in payme_transactions: re-delivered Create/Perform/
 *     Cancel return the stored result; only state 1 → 2 credits, exactly once,
 *     through confirmDonation() (which itself only transitions pending donations).
 *   • Cancel before perform → donation failed; cancel after perform → donation
 *     refunded (the apply_donation trigger reverses campaign totals, #39).
 *   • State-changing calls are logged to payment_events for audit/reconciliation.
 *   • Always HTTP 200 with a JSON-RPC result/error body (Payme requirement).
 */

type RpcRequest = { id?: number | string | null; method?: string; params?: Record<string, unknown> };

interface TxnRow {
  id: string;
  paycom_id: string;
  donation_id: string;
  order_ref: string;
  amount: number;
  state: number;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  reason: number | null;
}

const ok = (id: RpcRequest['id'], result: unknown) =>
  NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });

const fail = (id: RpcRequest['id'], code: number, message: string, data?: string) =>
  NextResponse.json({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data ? { data } : {}) },
  });

const txnResult = (t: TxnRow) => ({
  create_time: Number(t.create_time),
  perform_time: Number(t.perform_time),
  cancel_time: Number(t.cancel_time),
  transaction: t.id,
  state: t.state,
  reason: t.reason,
});

export async function POST(request: Request) {
  if (!isPaymeConfigured() || !verifyPaymeAuth(request.headers.get('authorization'))) {
    return fail(null, PaymeError.InvalidAuthorization, 'Invalid authorization');
  }

  let rpc: RpcRequest;
  try {
    rpc = (await request.json()) as RpcRequest;
  } catch {
    return fail(null, PaymeError.ParseError, 'Parse error');
  }
  const { id, method } = rpc;
  const params = rpc.params ?? {};

  // Unknown methods never need the database — answer before touching it.
  const KNOWN = [
    'CheckPerformTransaction',
    'CreateTransaction',
    'PerformTransaction',
    'CancelTransaction',
    'CheckTransaction',
    'GetStatement',
  ];
  if (!method || !KNOWN.includes(method)) {
    return fail(id, PaymeError.MethodNotFound, 'Method not found');
  }

  // Anything below (including client construction) must degrade to a JSON-RPC
  // error, never an HTTP 500 — Payme requires a JSON-RPC body on every response.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail(id, PaymeError.UnableToPerform, 'Service unavailable');
  }

  /** Resolve the donation for an account.order_id (our payment_ref). */
  const findDonation = async (orderRef: unknown) => {
    if (typeof orderRef !== 'string' || !orderRef) return null;
    const { data } = await admin
      .from('donations')
      .select('id, amount, status, payment_ref')
      .eq('payment_ref', orderRef)
      .maybeSingle();
    return data;
  };

  const findTxn = async (paycomId: unknown): Promise<TxnRow | null> => {
    if (typeof paycomId !== 'string' || !paycomId) return null;
    const { data } = await admin
      .from('payme_transactions')
      .select('*')
      .eq('paycom_id', paycomId)
      .maybeSingle();
    return data as TxnRow | null;
  };

  const logEvent = async (eventKey: string, t: { order_ref: string; donation_id: string; amount: number }, status: string) => {
    const eventId = await createPaymentEvent({
      provider: 'payme',
      providerEventId: eventKey,
      paymentRef: t.order_ref,
      donationId: t.donation_id,
      status,
      amount: Math.round(t.amount / 100), // stored in so'm, consistent with donations
      currency: 'UZS',
      rawPayload: { method, params } as Record<string, unknown>,
      signatureValid: true, // Basic-auth verified above
    });
    if (eventId) await markPaymentProcessed(eventId, { signatureValid: true });
  };

  try {
    switch (method) {
      // ── Can this order be paid? ────────────────────────────────────────────
      case 'CheckPerformTransaction': {
        const account = (params.account ?? {}) as Record<string, unknown>;
        const donation = await findDonation(account.order_id);
        if (!donation) return fail(id, PaymeError.OrderNotFound, 'Order not found', 'order_id');
        if (donation.status !== 'pending') {
          return fail(id, PaymeError.OrderUnavailable, 'Order is not payable', 'order_id');
        }
        if (params.amount !== somToTiyin(donation.amount)) {
          return fail(id, PaymeError.InvalidAmount, 'Invalid amount');
        }
        return ok(id, { allow: true });
      }

      // ── Create (or re-acknowledge) a transaction ───────────────────────────
      case 'CreateTransaction': {
        const existing = await findTxn(params.id);
        if (existing) {
          // Idempotent re-delivery: an active transaction is re-acknowledged;
          // a finalized one can no longer be (re)created.
          return existing.state === PaymeState.Created
            ? ok(id, txnResult(existing))
            : fail(id, PaymeError.UnableToPerform, 'Transaction already finalized');
        }

        const account = (params.account ?? {}) as Record<string, unknown>;
        const donation = await findDonation(account.order_id);
        if (!donation) return fail(id, PaymeError.OrderNotFound, 'Order not found', 'order_id');
        if (donation.status !== 'pending') {
          return fail(id, PaymeError.OrderUnavailable, 'Order is not payable', 'order_id');
        }
        if (params.amount !== somToTiyin(donation.amount)) {
          return fail(id, PaymeError.InvalidAmount, 'Invalid amount');
        }
        // Spec: a transaction Payme considers older than 12h must not be created.
        if (typeof params.time === 'number' && Date.now() - params.time > PAYME_TRANSACTION_TIMEOUT_MS) {
          return fail(id, PaymeError.UnableToPerform, 'Transaction timed out');
        }

        const { data: created, error } = await admin
          .from('payme_transactions')
          .insert({
            paycom_id: String(params.id),
            donation_id: donation.id,
            order_ref: donation.payment_ref!,
            amount: somToTiyin(donation.amount),
            state: PaymeState.Created,
            create_time: Date.now(),
          })
          .select('*')
          .single();
        if (error || !created) {
          // Unique violation on the active-per-donation index → another
          // transaction is already paying this order.
          return fail(id, PaymeError.OrderBusy, 'Order is busy with another transaction', 'order_id');
        }
        const t = created as TxnRow;
        await logEvent(`${t.paycom_id}:create`, t, 'pending');
        return ok(id, txnResult(t));
      }

      // ── Perform (credit) ───────────────────────────────────────────────────
      case 'PerformTransaction': {
        const t = await findTxn(params.id);
        if (!t) return fail(id, PaymeError.TransactionNotFound, 'Transaction not found');
        if (t.state === PaymeState.Performed) return ok(id, txnResult(t)); // idempotent
        if (t.state !== PaymeState.Created) {
          return fail(id, PaymeError.UnableToPerform, 'Transaction cancelled');
        }

        // Credit exactly once through the shared, verified path.
        const outcome = await confirmDonation(t.order_ref, 'completed', {
          amount: Math.round(t.amount / 100),
          currency: 'UZS',
        });
        if (outcome.status === 'failed' || (outcome.status === 'noop' && outcome.reason !== 'already_completed')) {
          return fail(id, PaymeError.UnableToPerform, 'Unable to perform transaction');
        }

        const performTime = Date.now();
        const { data: updated } = await admin
          .from('payme_transactions')
          .update({ state: PaymeState.Performed, perform_time: performTime })
          .eq('id', t.id)
          .eq('state', PaymeState.Created) // concurrency-safe transition
          .select('*')
          .maybeSingle();
        const done = (updated as TxnRow | null) ?? { ...t, state: PaymeState.Performed, perform_time: performTime };
        await logEvent(`${t.paycom_id}:perform`, t, 'completed');
        return ok(id, txnResult(done));
      }

      // ── Cancel (before or after perform) ───────────────────────────────────
      case 'CancelTransaction': {
        const t = await findTxn(params.id);
        if (!t) return fail(id, PaymeError.TransactionNotFound, 'Transaction not found');
        if (t.state === PaymeState.CancelledBeforePerform || t.state === PaymeState.CancelledAfterPerform) {
          return ok(id, txnResult(t)); // idempotent
        }

        const reason = typeof params.reason === 'number' ? params.reason : null;
        const cancelTime = Date.now();

        if (t.state === PaymeState.Created) {
          // Not yet credited → donation failed.
          await confirmDonation(t.order_ref, 'failed');
          const { data: updated } = await admin
            .from('payme_transactions')
            .update({ state: PaymeState.CancelledBeforePerform, cancel_time: cancelTime, reason })
            .eq('id', t.id)
            .eq('state', PaymeState.Created)
            .select('*')
            .maybeSingle();
          const done = (updated as TxnRow | null) ?? { ...t, state: PaymeState.CancelledBeforePerform, cancel_time: cancelTime, reason };
          await logEvent(`${t.paycom_id}:cancel`, t, 'failed');
          return ok(id, txnResult(done));
        }

        // Performed → refund. The apply_donation trigger (#39) reverses the
        // campaign totals when a completed donation becomes refunded.
        await admin
          .from('donations')
          .update({ status: 'refunded' as DonationStatus })
          .eq('payment_ref', t.order_ref)
          .eq('status', 'completed');
        const { data: updated } = await admin
          .from('payme_transactions')
          .update({ state: PaymeState.CancelledAfterPerform, cancel_time: cancelTime, reason })
          .eq('id', t.id)
          .eq('state', PaymeState.Performed)
          .select('*')
          .maybeSingle();
        const done = (updated as TxnRow | null) ?? { ...t, state: PaymeState.CancelledAfterPerform, cancel_time: cancelTime, reason };
        await logEvent(`${t.paycom_id}:refund`, t, 'refunded');
        return ok(id, txnResult(done));
      }

      // ── Audit ──────────────────────────────────────────────────────────────
      case 'CheckTransaction': {
        const t = await findTxn(params.id);
        if (!t) return fail(id, PaymeError.TransactionNotFound, 'Transaction not found');
        return ok(id, txnResult(t));
      }

      case 'GetStatement': {
        const from = typeof params.from === 'number' ? params.from : 0;
        const to = typeof params.to === 'number' ? params.to : Date.now();
        const { data } = await admin
          .from('payme_transactions')
          .select('*')
          .gte('create_time', from)
          .lte('create_time', to)
          .order('create_time', { ascending: true });
        return ok(id, {
          transactions: ((data ?? []) as TxnRow[]).map((t) => ({
            id: t.paycom_id,
            time: Number(t.create_time),
            amount: Number(t.amount),
            account: { order_id: t.order_ref },
            create_time: Number(t.create_time),
            perform_time: Number(t.perform_time),
            cancel_time: Number(t.cancel_time),
            transaction: t.id,
            state: t.state,
            reason: t.reason,
          })),
        });
      }

      default:
        return fail(id, PaymeError.MethodNotFound, 'Method not found');
    }
  } catch {
    // DB/transient failure — Payme retries on this generic error.
    return fail(id, PaymeError.UnableToPerform, 'Unable to perform operation');
  }
}
