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
//              → {error_code, error_note, payment_id, payment_status}   (SYNCHRONOUS — no Prepare/Complete)
//   • DELETE /v2/merchant/card_token/:service_id/:card_token
//              → {error_code, error_note}
//
// The merchant secret is REQUIRED on every call, so these are server-only — the
// browser never touches them. The PAN (card_number) reaches this backend for
// `request` only; it is never logged or stored (only last4 is kept).
//
// ⚠️ OPEN ITEMS (must be confirmed with Click before ENABLING — see PROJECT_STATUS
// §11 Q7/Q8): the exact `payment_status` success value and the invalid/expired
// -token `error_code` values are not published in the reachable docs. We treat
// `error_code === 0` as success (documented convention) and expose the raw code
// so the caller can react; auto-deactivation on invalid token is gated on
// CLICK_INVALID_TOKEN_ERROR_CODES, which is intentionally EMPTY until confirmed
// (so we never wrongly kill a card on a transient decline).
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

// ── payment: charge a verified token. SYNCHRONOUS — result in the response. ──
export interface CardTokenPaymentResult {
  ok: boolean;
  errorCode?: number;
  errorNote?: string;
  paymentId?: number;
  paymentStatus?: number;
  /** True when Click's error signals the token is dead → caller deactivates it. */
  invalidToken: boolean;
}

export async function cardTokenPayment(input: {
  cardToken: string;
  amount: number; // so'm; server-set from the pending donation, never client-trusted
  transactionParameter: string; // our payment_ref (click_<donationId>)
}): Promise<CardTokenPaymentResult> {
  const data = await callJson('/card_token/payment', 'POST', {
    service_id: Number(serviceId()) || serviceId(),
    card_token: input.cardToken,
    amount: input.amount,
    transaction_parameter: input.transactionParameter,
  });
  if (!data) return { ok: false, invalidToken: false };
  const errorCode = num(data.error_code);
  return {
    ok: errorCode === 0,
    errorCode,
    errorNote: str(data.error_note),
    paymentId: num(data.payment_id),
    paymentStatus: num(data.payment_status),
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
