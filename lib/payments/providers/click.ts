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
 * Deterministic merchant_prepare_id for a donation: the first 12 hex chars of
 * its UUID as an integer (48 bits — inside Number.MAX_SAFE_INTEGER). Being
 * derived (not stored) makes Prepare naturally idempotent, and lets Complete
 * verify the echoed id without an extra table.
 */
export function derivePrepareId(donationId: string): number {
  return parseInt(donationId.replace(/-/g, '').slice(0, 12), 16);
}

export const clickProvider: PaymentProvider = {
  id: 'click',

  // Note: the donor's app-vs-card choice (params.submethod) is a UX hint only —
  // Click's hosted checkout natively offers both CLICK-account and UzCard/Humo
  // card payment on the same page, so the URL doesn't change per submethod.
  async createPayment({ donationId, amount, returnUrl }) {
    const reference = `click_${donationId}`;

    // Land the donor back on the payment-status page, which polls until the
    // server-to-server Complete callback confirms (or fails) the donation.
    const ret = new URL(returnUrl);
    ret.searchParams.set('ref', reference);

    const url = new URL(CLICK_CHECKOUT_URL);
    url.searchParams.set('service_id', process.env.CLICK_SERVICE_ID ?? '');
    url.searchParams.set('merchant_id', process.env.CLICK_MERCHANT_ID ?? '');
    url.searchParams.set('amount', amount.toFixed(2)); // integer so'm, Click expects a float string
    url.searchParams.set('transaction_param', reference);
    url.searchParams.set('return_url', ret.toString());

    return {
      provider: 'click',
      reference,
      status: 'pending',
      redirectUrl: url.toString(),
    };
  },

  // Click's callbacks don't fit the generic verifyWebhook/WebhookResult shape
  // (two-phase protocol + provider-mandated response JSON), so its handling
  // lives in app/api/payments/click/route.ts, built on the same helpers
  // (payment_events log, idempotency, confirmDonation).
};
