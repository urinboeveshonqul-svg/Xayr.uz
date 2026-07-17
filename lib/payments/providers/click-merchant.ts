import { createHash } from 'node:crypto';

// ============================================================
// Click Merchant API — status lookup ONLY. SERVER-ONLY.
//
// Used exclusively by the reconciliation job (lib/payments/reconcile-click.ts)
// to answer one question: "does Click have a payment on record for this order?"
// It is the authoritative fallback for the embedded checkout.js flow, whose
// client-side `status` is never trusted and whose SHOP-API callback is not
// documented to fire (audit F-1).
//
// This module implements ONLY documented endpoints (docs.click.uz/en/merchant-api):
//   • Auth header:  merchant_user_id:sha1(timestamp + secret_key):timestamp
//   • GET /v2/merchant/payment/status_by_mti/:service_id/:merchant_trans_id/:date
//       → { error_code, error_note, payment_id, merchant_trans_id }
//
// IMPORTANT — why this only DETECTS, never auto-credits:
//   The documented status endpoints return NO captured amount. checkout.js takes
//   the amount as a client-side parameter, so a tampered client could underpay;
//   without a Click-reported amount we cannot verify it. Crediting therefore
//   stays exclusively on the amount-verified paths (the SHOP-API callback →
//   confirmDonation). This lookup only proves a payment EXISTS, so the job can
//   surface a captured-but-pending donation to admins instead of leaving it
//   silently pending forever.
// ============================================================

const MERCHANT_API_BASE = 'https://api.click.uz/v2/merchant';

/**
 * Reconciliation needs a Merchant-API credential (merchant_user_id) in addition
 * to the SHOP-API service id + secret. Absent it, reconciliation is INERT — the
 * job logs and does nothing, so an unconfigured deploy is never affected.
 */
export function isClickMerchantConfigured(): boolean {
  return Boolean(
    process.env.CLICK_SERVICE_ID &&
      process.env.CLICK_SECRET_KEY &&
      process.env.CLICK_MERCHANT_USER_ID
  );
}

/** Documented auth header: merchant_user_id:sha1(timestamp+secret_key):timestamp. */
function authHeader(): string {
  const merchantUserId = process.env.CLICK_MERCHANT_USER_ID ?? '';
  const secretKey = process.env.CLICK_SECRET_KEY ?? '';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHash('sha1').update(`${timestamp}${secretKey}`).digest('hex');
  return `${merchantUserId}:${digest}:${timestamp}`;
}

export interface MtiLookupResult {
  /** The request reached Click and returned a well-formed body. */
  ok: boolean;
  /** Click reports a payment on record for this merchant_trans_id (error_code 0 + payment_id). */
  paymentFound: boolean;
  /** Click's payment id, when a payment exists. */
  paymentId?: number;
  /** Raw error_code as returned (0 = success). */
  errorCode?: number;
  errorNote?: string;
}

/**
 * Look up whether Click has a payment for `merchantTransId` on `dateYmd`
 * (YYYY-MM-DD). Never throws — any network/parse failure returns
 * `{ ok: false, paymentFound: false }` so the caller fails safe (leaves the
 * donation pending, retries next run). Never credits or fails a donation.
 */
export async function lookupPaymentByMti(
  merchantTransId: string,
  dateYmd: string
): Promise<MtiLookupResult> {
  const serviceId = process.env.CLICK_SERVICE_ID ?? '';
  const url = `${MERCHANT_API_BASE}/payment/status_by_mti/${encodeURIComponent(
    serviceId
  )}/${encodeURIComponent(merchantTransId)}/${encodeURIComponent(dateYmd)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Auth: authHeader(),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, paymentFound: false };

    const data = (await res.json()) as {
      error_code?: number;
      error_note?: string;
      payment_id?: number;
    };
    const errorCode = typeof data.error_code === 'number' ? data.error_code : undefined;
    const paymentId = typeof data.payment_id === 'number' ? data.payment_id : undefined;
    // A payment is on record only when the API reports success (0) AND a payment id.
    const paymentFound = errorCode === 0 && paymentId != null && paymentId > 0;
    return { ok: true, paymentFound, paymentId, errorCode, errorNote: data.error_note };
  } catch {
    // Timeout / network / bad JSON → fail safe (unknown, retry next run).
    return { ok: false, paymentFound: false };
  }
}
