// ============================================================
// Click checkout.js — in-page card payment (UZCARD / HUMO).
// CLIENT-ONLY. Source: https://docs.click.uz/click-pay-by-card
//
// Click's library opens its OWN payment window over the page. Per the docs:
// "Данные карты не передаются мерчанту" — the card number, expiry and CVV go
// straight to Click and never touch Xayr's client state, servers or logs. That
// is the whole point of using it: Xayr stays out of PCI scope, and there is no
// PAN to store because we never receive one.
//
// ⚠️ checkout.js returns NOTHING but a status — no card token, no payment_id,
// no card mask. Saved cards and recurring donations are therefore NOT possible
// through this library; they would require Click's Card Token API (a separate,
// PCI-scoped decision). Nothing here blocks adding that later.
//
// This module wraps ONLY what the documentation specifies. No undocumented
// parameters, callbacks or behaviour are inferred.
// ============================================================

/** Documented library URL. */
export const CLICK_CHECKOUT_SRC = 'https://my.click.uz/pay/checkout.js';

/**
 * Documented payment statuses returned to the callback:
 *   < 0  Ошибка (error)      0  Платёж создан (created)
 *     1  В обработке          2  Успешно завершён (success)
 *
 * ⚠️ UX ONLY. This value arrives in the browser and is attacker-controlled, so
 * it MUST NEVER credit a donation. Money is only ever credited server-side by
 * confirmDonation() from a verified Click callback. See the G1 note in
 * lib/payments/providers/click.ts.
 */
export const ClickCheckoutStatus = {
  Created: 0,
  Processing: 1,
  Success: 2,
} as const;

/** Exactly the documented parameters of createPaymentRequest. */
export interface ClickCheckoutParams {
  service_id: string;
  merchant_id: string;
  /** Documented format: N.NN */
  amount: string;
  /** Our merchant_trans_id — the donation's payment_ref. */
  transaction_param: string;
  /** Optional. In checkout.js this means "user id in the SUPPLIER's system"
   *  (i.e. ours) — NOT the Merchant API credential of the same name. */
  merchant_user_id?: string;
  card_type?: 'uzcard' | 'humo';
}

type CreatePaymentRequestFn = (
  params: ClickCheckoutParams,
  callback: (data: { status: number }) => void
) => void;

declare global {
  interface Window {
    createPaymentRequest?: CreatePaymentRequestFn;
  }
}

let loader: Promise<void> | null = null;

/**
 * Load checkout.js once per page. Resolves when window.createPaymentRequest is
 * available; rejects if the script fails (blocked, offline, CSP) so the caller
 * can fall back to the redirect rather than leaving the donor stuck.
 */
export function loadClickCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('client only'));
  if (typeof window.createPaymentRequest === 'function') return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CLICK_CHECKOUT_SRC}"]`);
    const done = () =>
      typeof window.createPaymentRequest === 'function'
        ? resolve()
        : reject(new Error('checkout.js loaded but createPaymentRequest is missing'));

    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('checkout.js failed to load')), { once: true });
      return;
    }

    const s = document.createElement('script');
    s.src = CLICK_CHECKOUT_SRC;
    s.async = true;
    s.addEventListener('load', done, { once: true });
    s.addEventListener('error', () => reject(new Error('checkout.js failed to load')), { once: true });
    document.head.appendChild(s);
  }).catch((err) => {
    loader = null; // allow a retry on the next attempt
    throw err;
  });

  return loader;
}

/**
 * Open Click's card window. Resolves with the documented status once the donor
 * closes it. Rejects if the library can't load — callers should then fall back
 * to the redirect URL.
 */
export async function openClickCardCheckout(params: ClickCheckoutParams): Promise<number> {
  await loadClickCheckout();
  return new Promise<number>((resolve) => {
    window.createPaymentRequest!(params, (data) => resolve(Number(data?.status)));
  });
}
