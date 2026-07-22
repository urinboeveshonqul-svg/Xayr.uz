import { createHash } from 'node:crypto';

// ============================================================
// Click Card Token API — SERVER ONLY. Powers the OPTIONAL "saved cards" feature.
//
// Verified against the official docs (docs.click.uz/en/merchant-api-request):
//   • Same Merchant-API auth as click-merchant.ts:
//       Auth: merchant_user_id:sha1(timestamp + secret_key):timestamp
//   • POST   /v2/merchant/card_token/request  {service_id, card_number, expire_date(MMYY), phone_number, temporary}
//              → {error_code, error_note, card_token, phone_number, temporary}  (sends an SMS OTP)
//   • POST   /v2/merchant/card_token/verify   {service_id, card_token, sms_code}
//              → {error_code, error_note, card_number}   (confirms the token)
//   • POST   /v2/merchant/card_token/payment  {service_id, card_token, amount, transaction_parameter}
//              → {error_code, error_note, payment_id, payment_status}
//   • DELETE /v2/merchant/card_token/:service_id/:card_token
//              → {error_code, error_note}
//
// The merchant secret is REQUIRED on every call, so these are server-only — the
// browser never touches them. The PAN (card_number) reaches this backend for
// `request` only; it is never logged or stored (only last4 is kept).
//
// Confirmed by Click support (2026-07-22):
//   • `amount` is sent in UZS (so'm), NOT tiyin.
//   • `payment_status`: 0 = error (see error_note), 1 = processing, 2 = success.
//   • `temporary=0` creates a PERSISTENT token with no expiration limit.
//   • `card_token/delete` PERMANENTLY invalidates the token — a new token must be
//     created afterwards.
//   • After a successful `card_token/payment`, Click ALSO sends the normal SHOP
//     API Prepare + Complete callbacks. So this module does NOT finalize the
//     donation — it only places the charge; the Complete callback finalizes via
//     confirmDonation(), exactly like Checkout JS (the single finalizer).
//
// STILL OPEN: the specific invalid/expired-token `error_code` value is not yet
// confirmed, so CLICK_INVALID_TOKEN_ERROR_CODES stays EMPTY (auto-deactivation
// inert until known — never wrongly kill a card on a transient decline).
// ============================================================

const MERCHANT_API_BASE = 'https://api.click.uz/v2/merchant';
const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Card Token API needs the SHOP credentials (service_id + secret) AND the
 * Merchant-API user id. Absent any, the saved-cards feature stays OFF.
 */
export function isClickCardTokenConfigured(): boolean {
  return Boolean(
    process.env.CLICK_SERVICE_ID &&
      process.env.CLICK_SECRET_KEY &&
      process.env.CLICK_MERCHANT_USER_ID
  );
}

/**
 * Error codes that mean "this token is no longer usable" → deactivate the saved
 * card. EMPTY until confirmed with Click (Q8). Until then an unknown non-zero
 * code is treated as a retryable failure (card kept), never auto-deactivated.
 */
export const CLICK_INVALID_TOKEN_ERROR_CODES: readonly number[] = [];

function authHeader(): string {
  const merchantUserId = process.env.CLICK_MERCHANT_USER_ID ?? '';
  const secretKey = process.env.CLICK_SECRET_KEY ?? '';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHash('sha1').update(`${timestamp}${secretKey}`).digest('hex');
  return `${merchantUserId}:${digest}:${timestamp}`;
}

const serviceId = () => process.env.CLICK_SERVICE_ID ?? '';

async function callJson(
  path: string,
  method: 'POST' | 'DELETE',
  body?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${MERCHANT_API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Auth: authHeader(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// ── request: create a token + trigger the SMS OTP. PAN transits here only. ──
export interface CardTokenRequestResult {
  ok: boolean;
  errorCode?: number;
  errorNote?: string;
  cardToken?: string; // unverified until /verify succeeds
  maskedPhone?: string;
}

export async function cardTokenRequest(input: {
  cardNumber: string;
  expireDate: string; // MMYY
  phoneNumber: string;
  temporary?: boolean;
}): Promise<CardTokenRequestResult> {
  const data = await callJson('/card_token/request', 'POST', {
    service_id: Number(serviceId()) || serviceId(),
    card_number: input.cardNumber,
    expire_date: input.expireDate,
    phone_number: input.phoneNumber,
    temporary: input.temporary ? 1 : 0,
  });
  if (!data) return { ok: false };
  const errorCode = num(data.error_code);
  return {
    ok: errorCode === 0,
    errorCode,
    errorNote: str(data.error_note),
    cardToken: str(data.card_token),
    maskedPhone: str(data.phone_number),
  };
}

// ── verify: confirm the token with the OTP. Returns Click's masked PAN. ──
export interface CardTokenVerifyResult {
  ok: boolean;
  errorCode?: number;
  errorNote?: string;
  maskedCardNumber?: string; // Click returns a masked PAN here
}

export async function cardTokenVerify(input: {
  cardToken: string;
  smsCode: string;
}): Promise<CardTokenVerifyResult> {
  const data = await callJson('/card_token/verify', 'POST', {
    service_id: Number(serviceId()) || serviceId(),
    card_token: input.cardToken,
    sms_code: input.smsCode,
  });
  if (!data) return { ok: false };
  const errorCode = num(data.error_code);
  return {
    ok: errorCode === 0,
    errorCode,
    errorNote: str(data.error_note),
    maskedCardNumber: str(data.card_number),
  };
}

// ── payment: place a charge on a verified token. ──
// This does NOT finalize the donation. Click sends Prepare + Complete afterwards,
// and the Complete callback finalizes via confirmDonation() (single finalizer).
// `accepted` means the charge was placed (payment_status 1 processing or 2
// success); the caller hands off to the SHOP-API lifecycle + polling success page.
export interface CardTokenPaymentResult {
  /** payment_status 1 (processing) or 2 (success) with error_code 0 → charge placed. */
  accepted: boolean;
  errorCode?: number;
  errorNote?: string;
  paymentId?: number;
  /** Confirmed by Click: 0 = error, 1 = processing, 2 = success. */
  paymentStatus?: number;
  /** True when Click's error signals the token is dead → caller deactivates it. */
  invalidToken: boolean;
}

export async function cardTokenPayment(input: {
  cardToken: string;
  amount: number; // UZS (so'm) — server-set from the pending donation, never client-trusted
  transactionParameter: string; // our payment_ref (click_<donationId>)
}): Promise<CardTokenPaymentResult> {
  const data = await callJson('/card_token/payment', 'POST', {
    service_id: Number(serviceId()) || serviceId(),
    card_token: input.cardToken,
    amount: input.amount, // UZS (so'm), per Click confirmation
    transaction_parameter: input.transactionParameter,
  });
  if (!data) return { accepted: false, invalidToken: false };
  const errorCode = num(data.error_code);
  const paymentStatus = num(data.payment_status);
  return {
    // Only payment_status 1 (processing) or 2 (success) count as accepted.
    accepted: errorCode === 0 && (paymentStatus === 1 || paymentStatus === 2),
    errorCode,
    errorNote: str(data.error_note),
    paymentId: num(data.payment_id),
    paymentStatus,
    invalidToken: errorCode != null && CLICK_INVALID_TOKEN_ERROR_CODES.includes(errorCode),
  };
}

// ── delete: revoke a token at Click (best-effort; local deactivate is authoritative). ──
export async function cardTokenDelete(cardToken: string): Promise<boolean> {
  const data = await callJson(
    `/card_token/${encodeURIComponent(serviceId())}/${encodeURIComponent(cardToken)}`,
    'DELETE'
  );
  return num(data?.error_code) === 0;
}
