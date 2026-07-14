import { timingSafeEqual } from '@/lib/security/timing-safe';
import type { PaymentProvider } from '../types';

// ============================================================
// Payme (payme.uz / Paycom) — Merchant API provider. SERVER-ONLY.
//
// Flow (see docs/payme-setup.md):
//   1. createPayment() builds the hosted-checkout redirect
//      (https://checkout.paycom.uz/<base64 params>); the donor pays there.
//   2. Payme drives the payment by calling OUR JSON-RPC 2.0 endpoint
//      (app/api/payments/payme) with CheckPerformTransaction →
//      CreateTransaction → PerformTransaction (and Cancel/Check/GetStatement).
//      Auth is HTTP Basic with the merchant KEY (timing-safe compare).
//   3. PerformTransaction credits the donation via confirmDonation()
//      (amount/currency verified, idempotent).
//
// Like Click, this module holds the provider + pure protocol helpers only —
// no Supabase imports — so it stays importable from server components.
// ============================================================

const DEFAULT_CHECKOUT_URL = 'https://checkout.paycom.uz';

/** Both merchant credentials must be present for Payme to be live. */
export function isPaymeConfigured(): boolean {
  return Boolean(process.env.PAYME_MERCHANT_ID && process.env.PAYME_SECRET_KEY);
}

/** Payme amounts are in tiyin (1 so'm = 100 tiyin). */
export function somToTiyin(som: number): number {
  return som * 100;
}
export function tiyinToSom(tiyin: number): number {
  return Math.round(tiyin) / 100;
}

/** Payme transaction states (their spec, stored verbatim). */
export const PaymeState = {
  Created: 1,
  Performed: 2,
  CancelledBeforePerform: -1,
  CancelledAfterPerform: -2,
} as const;

/** JSON-RPC error codes used by the merchant endpoint (Payme spec). */
export const PaymeError = {
  ParseError: -32700,
  MethodNotFound: -32601,
  InvalidAuthorization: -32504,
  InvalidAmount: -31001,
  TransactionNotFound: -31003,
  UnableToPerform: -31008,
  OrderNotFound: -31050,        // account errors live in -31050..-31099
  OrderUnavailable: -31051,
  OrderBusy: -31099,
} as const;

/** A transaction in state 1 older than this must be rejected/cancelled (spec). */
export const PAYME_TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/**
 * Verify the endpoint's HTTP Basic auth: password must equal the merchant KEY
 * (login is nominally "Paycom" but only the key is secret — compare timing-safe).
 */
export function verifyPaymeAuth(authorization: string | null): boolean {
  const key = process.env.PAYME_SECRET_KEY;
  if (!key || !authorization?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  return timingSafeEqual(decoded.slice(sep + 1), key);
}

export const paymeProvider: PaymentProvider = {
  id: 'payme',

  async createPayment({ donationId, amount, returnUrl }) {
    const reference = `payme_${donationId}`;

    const ret = new URL(returnUrl);
    ret.searchParams.set('ref', reference);

    // Checkout params are ';'-separated key=value pairs, base64-encoded in the
    // URL path. The account field name (ac.order_id) must match the field
    // configured in the Payme merchant cabinet.
    const params = [
      `m=${process.env.PAYME_MERCHANT_ID ?? ''}`,
      `ac.order_id=${reference}`,
      `a=${somToTiyin(amount)}`,
      `c=${ret.toString()}`,
    ].join(';');
    const base = (process.env.PAYME_CHECKOUT_URL || DEFAULT_CHECKOUT_URL).replace(/\/$/, '');

    return {
      provider: 'payme',
      reference,
      status: 'pending',
      redirectUrl: `${base}/${Buffer.from(params, 'utf8').toString('base64')}`,
    };
  },

  // Payme's callbacks are a JSON-RPC state machine (Create/Perform/Cancel/…)
  // with its own response contract, so — like Click — its handling lives in a
  // dedicated route (app/api/payments/payme), built on the same helpers.
};
