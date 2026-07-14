# XAYR — Payme (payme.uz / Paycom) Payment Setup

Payme is XAYR's second live payment gateway, integrated via the **Payme
Merchant API** (hosted checkout + a JSON-RPC 2.0 endpoint that Payme drives
server-to-server). Crediting goes through the same hardened `confirmDonation()`
path as Click (amount/currency verified, idempotent, audited in `payment_events`).

## How the flow works

```
Donor → DonationForm (method: Payme)
      → POST /api/donations              (pending donation, payment_ref = payme_<donationId>)
      → redirect to checkout.paycom.uz   (hosted checkout, params base64: m, ac.order_id, a, c)
Payme → POST /api/payments/payme         CheckPerformTransaction  — is the order payable?
Payme → POST /api/payments/payme         CreateTransaction        — state 1, stored in payme_transactions
Payme → POST /api/payments/payme         PerformTransaction       — credits via confirmDonation(), state 2
Donor → returned to /payment/success?ref=payme_<donationId> — polls until completed/failed
```

Payme may also call `CancelTransaction` (before perform → donation `failed`;
after perform → donation `refunded`, campaign totals reversed by the
`apply_donation` trigger, migration #39), `CheckTransaction`, and `GetStatement`
(both answered from the `payme_transactions` state table, migration #48).

Code map:
- **`lib/payments/providers/payme.ts`** — provider (`createPayment` builds the
  checkout redirect) + protocol helpers (Basic-auth verification, tiyin
  conversion, state/error constants).
- **`app/api/payments/payme/route.ts`** — the JSON-RPC merchant endpoint
  (idempotent state machine; always HTTP 200 with a JSON-RPC body).
- **`supabase/payme-transactions.sql`** (#48) — per-transaction state Payme
  audits (create/perform/cancel times echoed verbatim).

## 1. Merchant prerequisites

1. A registered Uzbek legal entity with a **Payme Business (Paycom) merchant
   account** — https://business.payme.uz.
2. After onboarding, Payme issues (in the merchant cabinet):
   - **Merchant ID** (`m` in the checkout URL)
   - **KEY** — the merchant API password (separate TEST and PRODUCTION keys)

## 2. Configure the Payme merchant cabinet

| Setting | Value |
|---|---|
| Endpoint (Merchant API URL) | `https://xayr.uz/api/payments/payme` |
| Account field | `order_id` (the checkout sends `ac.order_id = payme_<donationId>`) |

Payme authenticates itself to the endpoint with HTTP Basic auth (login
`Paycom`, password = your KEY). The endpoint verifies the key timing-safe and
answers `-32504` otherwise.

## 3. Environment variables (Vercel → server scope)

| Variable | Value | Notes |
|---|---|---|
| `PAYME_MERCHANT_ID` | from cabinet | never `NEXT_PUBLIC_` |
| `PAYME_SECRET_KEY` | KEY from cabinet | **secret** — authenticates every merchant-API call |
| `PAYME_CHECKOUT_URL` | *(optional)* | override for the sandbox: `https://checkout.test.paycom.uz` |

Env-gated like Click: with either required var missing, Payme stays a
"Coming Soon" card and nothing else changes. With both set, flip Payme on under
**/admin/payments** (Enabled + un-tick Coming Soon) — no code changes.

## 4. What the endpoint enforces

- **Auth first** — timing-safe Basic-auth check; failures never touch the DB.
- **Amount in tiyin** must equal `donation.amount × 100` exactly (−31001).
- **One active transaction per order** — a second `CreateTransaction` for the
  same donation answers −31099 (order busy); enforced by a partial unique index.
- **Idempotency** — re-delivered Create/Perform/Cancel return the stored result;
  crediting happens exactly once (state 1 → 2 + `confirmDonation`, which itself
  only transitions `pending` donations).
- **12-hour timeout** — stale `CreateTransaction` requests are rejected (−31008).
- **Audit** — create/perform/cancel are logged to `payment_events`; the full
  state history lives in `payme_transactions` for `CheckTransaction`/`GetStatement`.

## 5. Test before going live (Payme sandbox)

Payme provides a **merchant sandbox** (test cabinet + `checkout.test.paycom.uz` +
its automated protocol test-suite). With TEST credentials + `PAYME_CHECKOUT_URL`
set on a preview deployment:

1. Run Payme's sandbox test-suite against `/api/payments/payme` — it exercises
   wrong-auth, wrong-amount, unknown-order, double-create, perform, cancel
   before/after perform, CheckTransaction and GetStatement.
2. Donate on a test campaign choosing Payme → pay with a test card → the
   success page flips to **completed** and the campaign total increases.
3. Cancel after perform in the sandbox → donation becomes `refunded` and the
   campaign total is reversed (trigger #39).
4. Check `payment_events` (`payme` rows) and `payme_transactions` states.

## Prerequisite migrations

- `payment-provider-settings.sql` (#47) — applied ✅ (2026-07-14): flip Payme
  on/off from /admin/payments.
- **`payme-transactions.sql` (#48) — required before enabling Payme.**
- `payment-refund-reversal.sql` (#39) — refund/cancel-after-perform safety.

Run `supabase/verify-migrations.sql` to confirm.
