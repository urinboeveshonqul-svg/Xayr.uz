# XAYR — Click embedded card payment (checkout.js)

In-page card payment (UZCARD / HUMO) using Click's official `checkout.js`
library, so the donor never leaves the campaign page. **Opt-in and reversible:**
the proven redirect stays the default and the permanent fallback.

Source of truth: <https://docs.click.uz/click-pay-by-card>. Nothing here is
inferred beyond what that page documents.

## Why checkout.js (and what it costs us)

Click's library opens **its own** payment window over the page and states plainly:
*"Данные карты не передаются мерчанту"* — the card number, expiry and CVV go
straight to Click.

- ✅ Xayr never sees, transmits, logs or stores a PAN → **no PCI DSS scope**.
- ✅ There is no card data to leak, because we never receive any.
- ❌ **checkout.js returns only a `status`.** No `card_token`, no `payment_id`,
  no card mask.

That last point has a hard consequence: **saved cards and recurring donations
are impossible through checkout.js.** They need Click's **Card Token API**,
which requires sending the raw PAN to Click — and the only route the docs make
certain is via our own server, which *would* put Xayr in PCI scope. That is a
business decision, deliberately not taken here.

## What is NOT built (and must not be guessed)

- **Card Token API** (`/v2/merchant/card_token/*`) — not implemented. Do not
  add it speculatively; see "Open questions" below.
- **Saved payment methods / recurring donations** — no table, no model, no
  consent flow. Building storage for tokens that checkout.js never issues would
  be dead code.

None of this is blocked by the current design — see "Adding tokenization later".

## Enabling it

| Variable | Value | Effect |
|---|---|---|
| `NEXT_PUBLIC_CLICK_EMBEDDED_CARD` | `1` | Offers the in-page card window for the "Bank kartasi" option |
| *(unset / anything else)* | — | **Default.** Every donor uses the redirect |

Requires the existing `CLICK_MERCHANT_ID` / `CLICK_SERVICE_ID` /
`CLICK_SECRET_KEY` (Click must be live in the catalog). No new secrets: the flag
is a boolean, and `service_id`/`merchant_id` are already public in the redirect
URL.

**Rollback is instant:** unset the variable and redeploy. No migration, no data
change, no code revert.

CSP already allows `https://my.click.uz` (`script-src`, `frame-src`,
`connect-src`) in `next.config.mjs`. Without it the library cannot load — and
the donor silently falls back to the redirect rather than getting stuck.

## Flow

```
donor picks "Bank kartasi"
  → POST /api/donations            (pending row, payment_ref = click_<donationId>)
  → server returns { reference, redirectUrl, embedded? }
  → embedded present?  ── no ──→ redirect to my.click.uz (unchanged)
        │ yes
        ↓
     checkout.js window over the page; card data → Click only
        ↓
     callback { status }           (UX ONLY — never credits)
        ↓
     /payment/success?ref=…        polls our server for the real status
```

Crediting is unchanged and server-authoritative: **only** `confirmDonation()`,
reached from a verified Click callback, can move a donation to `completed`.

## G1 — RESOLVED (audit F-1)

**Does a checkout.js payment trigger the SHOP API Prepare/Complete callbacks,
the way the redirect flow does?**

The official pay-by-card docs (`docs.click.uz/en/click-pay-by-card`) document
**only** a client-side `status` field and never state that the SHOP-API
callbacks fire. Firing therefore cannot be assumed, and rather than guess, the
system is now made safe from **both** directions:

- **Crediting stays exclusively on the amount-verified path.** The client-side
  `status` is attacker-controlled and **never** credits. Money is credited only
  by the SHOP-API callback → `confirmDonation()` (which verifies amount +
  currency). If the callbacks fire, the donation credits exactly as the redirect
  does.
- **A reconciliation sweep guarantees no silent loss if they don't.** The cron
  `/api/cron/reconcile-click-payments` (`lib/payments/reconcile-click.ts`) queries
  the Merchant API `status_by_mti` for any Click donation still `pending` past a
  grace window. If Click has a captured payment on record, it alerts admins and
  writes an audit row — so an embedded card payment can **never** sit
  captured-but-pending silently.

**Why the reconciler detects but never auto-credits.** The documented Merchant
status endpoints (`status_by_mti`, `payment/status`) return **no captured
amount**. checkout.js takes the amount as a client parameter, so a tampered
client could underpay; without a Click-reported amount an auto-credit could not
verify it (the wrong-amount hole the SHOP-API callback closes). Detection +
admin alert is therefore the maximal *safe* automation. Admins complete or
refund a flagged payment from the cabinet.

Setup: set `CLICK_MERCHANT_USER_ID` (Merchant API user id; reuses
`CLICK_SECRET_KEY`) — the sweep is **inert** until it is set. The Merchant API
`Auth` header is `merchant_user_id:sha1(timestamp+secret_key):timestamp`.
Recommended before enabling `NEXT_PUBLIC_CLICK_EMBEDDED_CARD`.

**Ask Click:** *"When a payment is made through checkout.js with a
`transaction_param`, do you invoke our SHOP API Prepare and Complete URLs, as
with the redirect flow?"*

## Adding tokenization later (nothing here blocks it)

The seams are already in place:

- `PaymentIntent.embedded` is a **discriminated union** (`kind`). A future
  saved-card experience adds its own `kind`; the client renders it and the
  donation flow is untouched.
- **No schema change would be needed** for a token payment: it still creates a
  `pending` donation, still carries `payment_method='click'` and a
  `payment_ref`, and is still finalised by `confirmDonation()`. Saved cards
  would only add a *new* table, never alter `donations`.
- The provider registry, catalog and `confirmDonation()` are unchanged, so Card
  Token becomes an additional submethod rather than a redesign.

## Testing checklist (needs a real merchant)

checkout.js cannot be exercised locally — it needs live `service_id`/`merchant_id`
and Click's servers.

1. Set `NEXT_PUBLIC_CLICK_EMBEDDED_CARD=1` in a preview deployment.
2. Donate → "Bank kartasi" → the window opens **over** the page (no redirect).
3. Pay with a test card → land on `/payment/success?ref=…`.
4. **Confirm G1:** does the donation reach `completed`? Check `payment_events`
   for the `…:0` / `…:1` rows. If they are absent, the callbacks do **not** fire
   for checkout.js → implement path (b).
5. Close the window without paying → donation stays `pending`, totals unmoved.
6. Block `my.click.uz` in devtools → verify the redirect fallback still works.
7. Verify the campaign total moves **only** after a real completion.
