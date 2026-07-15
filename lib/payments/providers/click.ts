import { createHash } from 'node:crypto';
import { timingSafeEqual } from '@/lib/security/timing-safe';
import type { PaymentProvider } from '../types';

// ============================================================
// Click (click.uz) — SHOP API provider. SERVER-ONLY.
//
// Flow (see docs/click-setup.md):
//   1. createPayment() builds the hosted-checkout redirect URL; the donor pays
//      on Click's page.
//   2. Click calls our callback endpoint (app/api/payments/click) twice,
//      server-to-server: Prepare (action=0) then Complete (action=1). Both are
//      MD5-signed with the merchant secret key and must be answered with
//      Click's own JSON contract (NOT the generic webhook shape) — which is why
//      Click has a dedicated route instead of /api/payments/webhook.
//   3. The Complete handler credits the donation via confirmDonation()
//      (amount/currency verified, idempotent).
//
// This module holds the provider + pure protocol helpers only — no Supabase
// imports — so lib/payments/index.ts stays importable from server components.
// ============================================================

const CLICK_CHECKOUT_URL = 'https://my.click.uz/services/pay';

/** All three merchant credentials must be present for Click to be live. */
export function isClickConfigured(): boolean {
  return Boolean(
    process.env.CLICK_MERCHANT_ID && process.env.CLICK_SERVICE_ID && process.env.CLICK_SECRET_KEY
  );
}

/**
 * Opt-in flag for the in-page card experience (checkout.js). DEFAULT OFF: until
 * it is validated against a real merchant, every donor keeps the proven
 * redirect. Flip NEXT_PUBLIC_CLICK_EMBEDDED_CARD=1 to enable; unset it to roll
 * back instantly with no deploy.
 *
 * Read on the SERVER (this file is server-only) so embedded-vs-redirect is
 * decided in exactly one place, like provider availability in the catalog. The
 * NEXT_PUBLIC_ prefix is required for Next to inline it at build time; it is
 * not a secret — it is a boolean toggle.
 */
export function isClickEmbeddedCardEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CLICK_EMBEDDED_CARD === '1';
}

// ============================================================
// ⚠️ G1 — UNRESOLVED, AWAITING CLICK. Do not guess.
//
// Question: does a payment made through the checkout.js overlay trigger the
// SHOP API Prepare/Complete callbacks, exactly as the redirect flow does?
//
// The docs never state it. checkout.js reuses the same service_id / merchant_id
// / transaction_param as the redirect, which HINTS the callbacks fire — but a
// hint is not a specification, so nothing here depends on it.
//
// How money is credited today, and why this is safe either way:
//   • The ONLY crediting path is confirmDonation(), reached from a verified
//     server-to-server callback (app/api/payments/click). Unchanged.
//   • checkout.js's client-side `status` is UX ONLY. It is never trusted to
//     credit — it is attacker-controlled and the donor could simply edit it.
//   • So if the callbacks DO fire, the donation credits exactly as it does for
//     the redirect. If they do NOT, the donation stays 'pending' and no money is
//     ever wrongly credited — the failure is visible and safe, not silent.
//
// Two integration points exist for whichever answer Click gives:
//   (a) SHOP API callbacks — ALREADY IMPLEMENTED, no work needed.
//   (b) Merchant API confirmation — NOT IMPLEMENTED. Would poll the documented
//       GET /v2/merchant/payment/status_by_mti/:service_id/:merchant_trans_id/YYYY-MM-DD
//       and finalize through the same confirmDonation(). It needs the Auth
//       header (sha1(timestamp + secret_key)) and therefore a new
//       CLICK_MERCHANT_USER_ID env var. Build it ONLY if Click confirms (a)
//       does not fire — see docs/click-embedded-card.md.
// ============================================================

// Click SHOP API actions.
export const CLICK_ACTION_PREPARE = '0';
export const CLICK_ACTION_COMPLETE = '1';

// Merchant-side response codes defined by the Click SHOP API spec.
export const ClickError = {
  Success: 0,
  SignCheckFailed: -1,
  IncorrectAmount: -2,
  ActionNotFound: -3,
  AlreadyPaid: -4,
  UserNotFound: -5, // merchant_trans_id (our payment_ref) doesn't resolve
  TransactionNotFound: -6,
  FailedToUpdate: -7,
  BadRequest: -8,
  TransactionCancelled: -9,
} as const;

/** Raw callback parameters, kept as the exact strings Click sent (the MD5 sign
 *  string must be built from the raw values, never re-formatted numbers). */
export interface ClickCallbackParams {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id: string;
  merchant_trans_id: string;
  merchant_prepare_id: string | null; // present on Complete only
  amount: string;
  action: string;
  error: string;
  error_note: string;
  sign_time: string;
  sign_string: string;
}

const REQUIRED_FIELDS = [
  'click_trans_id',
  'service_id',
  'merchant_trans_id',
  'amount',
  'action',
  'sign_time',
  'sign_string',
] as const;

/** Parse + shape a Click callback body. Returns null when a required field is missing. */
export function parseClickCallback(form: FormData | URLSearchParams): ClickCallbackParams | null {
  const get = (k: string): string | null => {
    const v = form.get(k);
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  for (const f of REQUIRED_FIELDS) {
    if (get(f) === null) return null;
  }
  return {
    click_trans_id: get('click_trans_id')!,
    service_id: get('service_id')!,
    click_paydoc_id: get('click_paydoc_id') ?? '',
    merchant_trans_id: get('merchant_trans_id')!,
    merchant_prepare_id: get('merchant_prepare_id'),
    amount: get('amount')!,
    action: get('action')!,
    error: get('error') ?? '0',
    error_note: get('error_note') ?? '',
    sign_time: get('sign_time')!,
    sign_string: get('sign_string')!,
  };
}

/**
 * Verify the MD5 signature per the Click spec (timing-safe compare):
 *   Prepare : md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 *   Complete: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 */
export function verifyClickSignature(p: ClickCallbackParams, secretKey: string): boolean {
  const prepareId = p.action === CLICK_ACTION_COMPLETE ? (p.merchant_prepare_id ?? '') : '';
  const base = `${p.click_trans_id}${p.service_id}${secretKey}${p.merchant_trans_id}${prepareId}${p.amount}${p.action}${p.sign_time}`;
  const expected = createHash('md5').update(base).digest('hex');
  return timingSafeEqual(p.sign_string.toLowerCase(), expected);
}

/**
 * Deterministic merchant_prepare_id for a donation. Being derived (not stored)
 * makes Prepare naturally idempotent, and lets Complete verify the echoed id
 * without an extra table.
 *
 * Click types merchant_prepare_id as `int` (32-bit) — not `bigint` like
 * click_trans_id/click_paydoc_id. So the value MUST fit a signed 32-bit int,
 * or Click may truncate it and echo back a different id on Complete (failing
 * verification after the card was already charged). We take the first 8 hex
 * chars of the UUID (32 bits) and mask off the sign bit, yielding a stable,
 * non-negative value in [0, 0x7FFFFFFF]. Uniqueness across donations is not
 * required: the id is only ever compared against derivePrepareId(donation.id)
 * for the one donation resolved by merchant_trans_id.
 */
export function derivePrepareId(donationId: string): number {
  return parseInt(donationId.replace(/-/g, '').slice(0, 8), 16) & 0x7fffffff;
}

export const clickProvider: PaymentProvider = {
  id: 'click',

  // The donor's app-vs-card choice (params.submethod) does not change the
  // redirect URL — Click's hosted page offers both natively. It only decides
  // whether an embedded card checkout is offered alongside it (below).
  async createPayment({ donationId, amount, returnUrl, submethod }) {
    const reference = `click_${donationId}`;
    const serviceId = process.env.CLICK_SERVICE_ID ?? '';
    const merchantId = process.env.CLICK_MERCHANT_ID ?? '';
    // Documented N.NN format, shared by the redirect and checkout.js.
    const amountStr = amount.toFixed(2);

    // Land the donor back on the payment-status page, which polls until the
    // server-to-server Complete callback confirms (or fails) the donation.
    const ret = new URL(returnUrl);
    ret.searchParams.set('ref', reference);

    const url = new URL(CLICK_CHECKOUT_URL);
    url.searchParams.set('service_id', serviceId);
    url.searchParams.set('merchant_id', merchantId);
    url.searchParams.set('amount', amountStr); // integer so'm, Click expects a float string
    url.searchParams.set('transaction_param', reference);
    url.searchParams.set('return_url', ret.toString());

    // Offer the in-page card overlay ONLY for the card submethod and only when
    // explicitly enabled. redirectUrl is always returned too, so the client
    // silently falls back to the proven redirect if anything is missing.
    const embedded =
      submethod === 'card' && isClickEmbeddedCardEnabled()
        ? ({ kind: 'click_checkout_js', serviceId, merchantId, amount: amountStr } as const)
        : null;

    return {
      provider: 'click',
      reference,
      status: 'pending',
      redirectUrl: url.toString(),
      embedded,
    };
  },

  // Click's callbacks don't fit the generic verifyWebhook/WebhookResult shape
  // (two-phase protocol + provider-mandated response JSON), so its handling
  // lives in app/api/payments/click/route.ts, built on the same helpers
  // (payment_events log, idempotency, confirmDonation).
};
