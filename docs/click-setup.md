# XAYR — Click (click.uz) Payment Setup

Click is XAYR's first live payment gateway, integrated via the **Click SHOP API**
(hosted checkout + two signed server-to-server callbacks). Donations redirect the
donor to Click's payment page; Click then calls our callback endpoint to confirm
the payment, which credits the campaign through the existing hardened
`confirmDonation()` path (amount/currency verified, idempotent, fully audited in
`payment_events`).

## How the flow works

```
Donor → DonationForm (method: CLICK)
      → POST /api/donations            (pending donation, payment_ref = click_<donationId>)
      → redirect to my.click.uz        (hosted checkout)
Click → POST /api/payments/click       Prepare  (action=0, MD5-signed) — we validate & ack
Click → POST /api/payments/click       Complete (action=1, MD5-signed) — we credit via confirmDonation()
Donor → returned to /payment/success?ref=click_<donationId> — polls until completed/failed
```

Code map:
- **`lib/payments/providers/click.ts`** — provider (`createPayment` builds the
  checkout redirect) + protocol helpers (signature verification, prepare-id).
- **`app/api/payments/click/route.ts`** — the Prepare/Complete callback endpoint
  (Click mandates its own JSON response contract, so it has a dedicated route).
- **`lib/payments/confirm.ts` / `helpers.ts`** — shared crediting + audit path
  (unchanged; same guarantees as the generic webhook).

## 1. Merchant prerequisites

1. A registered Uzbek legal entity (or sole proprietor) with a **Click merchant
   account** — apply at https://click.uz (business/merchant onboarding).
2. After onboarding, Click issues (visible in the merchant cabinet
   https://merchant.click.uz):
   - **Merchant ID** (`merchant_id`)
   - **Service ID** (`service_id`)
   - **Secret key** (used for callback MD5 signatures)

## 2. Configure the Click merchant cabinet

In the merchant cabinet, for your service set **both** callback URLs to the same
endpoint (the `action` parameter distinguishes Prepare from Complete):

| Setting | Value |
|---|---|
| Prepare URL | `https://xayr.uz/api/payments/click` |
| Complete URL | `https://xayr.uz/api/payments/click` |
| Request type | `POST` (form-urlencoded) |

Notes:
- The endpoint must be publicly reachable over HTTPS (it is, on Vercel).
- If Click asks to allow-list your server IPs, note that Vercel uses dynamic
  egress IPs — the signature check (not IP filtering) is the security boundary.

## 3. Environment variables (Vercel → server scope)

| Variable | Value | Notes |
|---|---|---|
| `CLICK_MERCHANT_ID` | from cabinet | **secret scope fine; never `NEXT_PUBLIC_`** |
| `CLICK_SERVICE_ID` | from cabinet | callback `service_id` is validated against this |
| `CLICK_SECRET_KEY` | from cabinet | **secret** — signs/verifies every callback |
| `NEXT_PUBLIC_APP_URL` | `https://xayr.uz` | already required; used for the return URL |

The integration is **env-gated**: with any of the three Click vars missing, the
platform behaves exactly as before (manual/no-gateway provider, no method
selector in the donation form). Setting all three activates Click automatically —
no code change or redeploy flag needed (redeploy after setting env vars so the
serverless functions pick them up).

## 4. Callback protocol (what the endpoint enforces)

Signature (MD5, verified timing-safe; requests failing it are logged with
`signature_valid=false` and answered `-1`):

```
Prepare : md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
Complete: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
```

Merchant response codes used: `0` success, `-1` bad signature, `-2` amount
mismatch, `-3` unknown action, `-4` already paid, `-5` unknown transaction
param, `-6` prepare-id mismatch, `-7` transient processing failure (Click
retries), `-8` malformed request, `-9` cancelled.

Guarantees:
- **Idempotent** — `payment_events` dedupes by `click_trans_id:action`;
  re-delivered Complete for a finalized donation answers `-4`; `confirmDonation`
  only ever transitions `pending` rows.
- **Amount/currency verified** — the callback amount must equal the recorded
  donation exactly (integer so'm); a definitive mismatch marks the donation
  `failed` and alerts admins in-app. Never credits, never leaves pending.
- **Cancellations** — Complete with `error < 0` marks the donation `failed`
  (answered `-9`).
- **Audit** — every callback (including rejected ones) is a `payment_events`
  row; secrets are never logged (`sign_string` redacted).

## 5. Test before going live

Click provides a sandbox/test mode for new services (ask your Click integration
manager to enable it). Verify end-to-end:

1. Donate on a test campaign choosing CLICK → you land on Click checkout.
2. Pay with the test card → Click sends Prepare then Complete.
3. `/payment/success?ref=…` flips to **completed**; the campaign's raised amount
   increases (the `apply_donation` trigger fired).
4. Check **/admin/donations** (donation `completed`) and the `payment_events`
   table (two processed rows: `…:0`, `…:1`).
5. Cancel a payment on the Click page → donation flips to `failed`, campaign
   totals unchanged.
6. Replay the Complete request (same body) → response `-4`, no double credit.

## Prerequisite migrations

Already part of the standard sequence — nothing new for Click:
- `secure-donations-rls.sql` (#5) — clients can only insert `pending`.
- `payment-foundation.sql` (#38) — `payment_ref` unique + `payment_events`.
- `payment-refund-reversal.sql` (#39) — reversal safety on refund/fail.

Run `supabase/verify-migrations.sql` to confirm before enabling real payments.
