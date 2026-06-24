# XAYR — Payment Security Audit

> Read-only review of the payment/donation/payout money path. No providers were
> implemented. Focus: **anything that could lead to money loss.**
>
> **Date:** 2026-06-24 · Legend: ✅ sound · ⚠️ must-fix-before-go-live · 🔴 money-loss risk

## Current posture

No real gateway is integrated — only the `manual` provider (records `pending`,
never charges). The webhook path returns **501** for any provider without
`verifyWebhook`. **So no automated path moves real money today.** Every 🔴 below
is a latent risk that must be closed *before* a Click/Payme provider is enabled;
none is currently exploitable for loss.

The foundations are strong: tamper-proof donations (clients insert `pending`
only; completion is service-role), idempotent confirmation, a `payment_events`
audit log, unique `payment_ref`, and an admin-gated payout state machine.

## Area-by-area

| # | Area | Verdict | Notes |
|---|---|---|---|
| 1 | Amount verification | ⚠️ | `confirmDonation` checks `paid === recorded` via `validatePaymentAmount` (exact integer) — **but only when `expected.amount` is non-null**. A provider that omits the amount credits with NO check. |
| 2 | Currency verification | ⚠️ | `validateCurrency` enforces UZS — **only when `expected.currency` is non-null**. Omitted currency skips the check. |
| 3 | Webhook signatures | 🔴 | Delegated to `provider.verifyWebhook()` (must throw on bad sig). The route **does not independently enforce `result.signatureValid`** — a provider that returns `signatureValid:false` *without throwing* still credits. Logging also defaults unknown → `true`. |
| 4 | Duplicate protection | ✅ | `isDuplicateWebhook` (unique `provider`+`provider_event_id`, `processed=true`) + unique `payment_ref` + `confirmDonation`'s conditional `update … .eq('status','pending')`. No double-credit even under concurrent re-delivery. |
| 5 | Payment event logging | ✅ | Logged **before** processing; `markPaymentProcessed` records success or keeps `processed=false` + `error_message` for retry. Admin-only read (RLS). |
| 6 | Refund safety | 🔴 | **No refund accounting exists.** `apply_donation` only credits on →`completed`; nothing reverses `current_amount`/`donors_count` on `completed`→`refunded`/`failed`. `'refunded'` is in the enum but has no logic. |
| 7 | Idempotency | ✅ | Conditional status transition + dedupe + unique indexes. Re-delivered webhooks are no-ops. |
| 8 | Admin controls | ✅ | Completion is service-role only (no client UPDATE policy). Payout state machine is admin-gated (`is_admin()`), with an over-withdrawal guard, one-active-request unique index, and server-computed commission. |

## Money-loss risks (ranked)

### 🔴 M1 — Webhook doesn't enforce signature validity (defense-in-depth gap)
`app/api/payments/webhook/route.ts` trusts that `verifyWebhook()` throws on a bad
signature, but never checks `result.signatureValid` itself before calling
`confirmDonation`. A provider implementation that returns `{ signatureValid: false }`
instead of throwing — or a future bug in one — would credit a campaign from a
**forged/unsigned webhook**. It also logs `signatureValid: result.signatureValid ?? true`
(unknown treated as valid).
**Fix (before any provider):** in the route, `if (result.signatureValid === false) → reject (mark event, 400)`; default unknown to `false` in the log.

### 🔴 M2 — Amount/currency verification is optional, not mandatory
`confirmDonation` only verifies when `expected.amount`/`expected.currency` are
non-null. A provider that omits them (or a caller that passes none) credits the
campaign with **no amount/currency check** — an underpayment or wrong-currency
payment would still credit the full recorded amount.
**Fix (before any provider):** for a `completed` transition, require `amount`
present and `validatePaymentAmount` to pass (and currency present + valid); throw
(fail closed) if missing. Keep the manual/no-`expected` path only for non-charging flows.

### 🔴 M3 — No refund/chargeback reversal → withdrawable refunded funds
Because `completed`→`refunded`/`failed` does not decrement `current_amount`/`donors_count`,
and `campaign_available_balance = current_amount − committed payouts`, a refunded
donation **remains withdrawable**. Once real payments + refunds exist, a creator
could withdraw money that was returned to the donor → **direct loss**.
**Fix (before refunds or go-live):** trigger to reverse totals when a donation
leaves `completed`; exclude refunded/charged-back amounts from the payout balance;
consider blocking/clawing back payouts when a refund lands after disbursement.

### ⚠️ M4 — Payout balance trusts `current_amount` (depends on live RLS)
The over-withdrawal guard is only as sound as the tamper-proofing of
`current_amount`, which relies on migration #5 (`secure-donations-rls.sql`) being
**applied in production**. If unapplied, clients could insert `completed`
donations and inflate balances → payout of fake funds.
**Fix:** run `supabase/verify-migrations.sql`; confirm #5 is live before enabling payouts. (See `docs/rls-audit.md`.)

### ⚠️ M5 — Amount mismatch leaves the donation stuck `pending`
On mismatch `confirmDonation` throws and the row stays `pending` forever, while
the provider may have captured funds. Not a credit-loss, but a reconciliation gap
(donor charged, campaign shows nothing).
**Fix:** on verified mismatch, transition to `failed` + flag the `payment_events`
row for manual review/alert rather than leaving it pending.

### 🟡 M6 — Minor logging/linkage
`payment_events.donation_id` isn't populated at log time (reconcile via
`payment_ref`); `signatureValid` defaults to `true` when unknown. Cosmetic/audit
clarity, not loss.

## What's already safe (do not regress)
- Clients can never set `status='completed'` (RLS `donations_insert_pending`); credit happens only via the service role + `apply_donation` trigger.
- Donors cannot inflate credit: completion verifies `paid === recorded`, so paying less never credits more.
- Idempotent + concurrency-safe confirmation (conditional update) — no double credit.
- Unique `payment_ref` and unique `(provider, provider_event_id)` prevent duplicate rows/events.
- Payout writes only through `SECURITY DEFINER` functions that re-check ownership/verification/admin, with an over-withdrawal guard and one-active-request-per-campaign.
- `payment_events` raw payloads are admin-only.

## Pre-go-live checklist (close before enabling a real provider)
- [x] **M1** Enforce `signatureValid` in the webhook route — rejects + logs an event on `=== false`; unknown is no longer defaulted to `true`. (`app/api/payments/webhook/route.ts`)
- [x] **M2** Amount + currency verification is mandatory for `completed` — missing → throws (fail closed); never credits without a verified amount. (`lib/payments/confirm.ts`)
- [x] **M3** Refund reversal added — `apply_donation` reverses `current_amount`/`donors_count` (floored at 0) on `completed`→`refunded`/`failed`, removing refunded funds from the payout balance. (`supabase/payment-refund-reversal.sql`, schema.sql, secure-campaign-fields-rls.sql)
- [ ] **M4** Verify migration #5 is live in production (`verify-migrations.sql`) — **UNVERIFIED from code; cannot be confirmed without DB access. Must be run before enabling payments/payouts.**
- [x] **M5** Mismatches now mark the donation `failed`, log the event, and alert admins (in-app) — never left `pending`. (`lib/payments/confirm.ts`, `lib/payments/helpers.ts`, webhook route)
- [ ] Verify the provider's `verifyWebhook` validates the signature/checksum and populates `amount`, `currency`, `providerEventId`, `signatureValid`. (Provider work — out of scope here.)

## Remaining risks after this hardening
- **M4 unverified:** the payout over-withdrawal guard and refund reversal both trust `current_amount`, which is only tamper-proof if migration #5 (`secure-donations-rls.sql`) is live. Run `verify-migrations.sql` before go-live.
- **Post-payout refund (clawback):** if a donation is refunded *after* its funds were already withdrawn (`payout_requests.status='paid'`), reversal floors `current_amount` at 0 and blocks *future* withdrawals, but the already-disbursed money is off-platform — recovery is a manual/operational process, not a DB safeguard.
- **Missing-amount stuck pending:** if a provider repeatedly omits amount/currency, the donation stays `pending` (correct fail-closed behavior) — depends on the provider sending complete data.
- **No real provider yet:** signature/amount verification only takes effect once a provider implements `verifyWebhook` correctly.
