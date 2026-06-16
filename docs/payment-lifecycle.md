# Xayr — Payment & Donation Lifecycle

Donations are **fully automatic**. No admin ever approves or rejects an
individual donation — the payment provider decides the outcome and a verified
webhook drives the status transition. This mirrors GoFundMe / Kickstarter /
LaunchGood.

## Architecture

```
User clicks Donate
      │
      ▼
POST /api/donations ──► insert donation (status = 'pending', service role)
      │                 └─ getPaymentProvider(method).createPayment()
      ▼
Redirect to provider checkout (Payme / Click / Uzcard / Humo)
      │
      ├── payment succeeds ──► provider calls our webhook
      │                          POST /api/payments/webhook?provider=<id>
      │                          └─ provider.verifyWebhook(req)  (signature check)
      │                          └─ confirmDonation(reference, 'completed')
      │                              └─ donations.status → 'completed'
      │                                  ├─ trigger apply_donation:
      │                                  │     current_amount += amount
      │                                  │     donors_count   += 1
      │                                  │     notify campaign OWNER
      │                                  ├─ trigger notify_on_donation_status:
      │                                  │     notify DONOR (completed)
      │                                  └─ trigger notify_on_campaign_milestone:
      │                                        goal reached → notify DONORS/followers
      │
      └── payment fails ─────► provider webhook with failed status
                                 └─ confirmDonation(reference, 'failed')
                                     └─ donations.status → 'failed'
                                         └─ trigger notify_on_donation_status:
                                               notify DONOR (failed)
```

No admin action appears anywhere in this flow.

## Donation statuses
Only payment-processing statuses exist:

| Status | Meaning | Set by |
|---|---|---|
| `pending` | Created, awaiting payment | client → server API (the only status a client can cause) |
| `completed` | Payment confirmed | `confirmDonation()` via verified webhook (service role) |
| `failed` | Payment failed/declined | `confirmDonation()` via verified webhook |
| `refunded` | Refunded out-of-band | service role (future) |

`completed`/`failed`/`refunded` are reachable **only** through the service role —
clients are blocked by RLS (`donations_insert_pending`), which keeps totals
tamper-proof.

## Payment flow (code)
- **Create:** [app/api/donations/route.ts](../app/api/donations/route.ts) — Zod-validated, IP rate-limited, inserts `pending`, stores `payment_ref`, hands off to the provider, returns `redirectUrl`/instructions.
- **Confirm:** [lib/payments/confirm.ts](../lib/payments/confirm.ts) — `confirmDonation(reference, status)`; idempotent (`WHERE status='pending'`), service-role only.
- **Credit + notify:** DB triggers `apply_donation`, `notify_on_donation_status`, `notify_on_campaign_milestone` (migrations: schema.sql, admin-donation-management.sql, donor-notifications.sql).

## Webhook flow
- **Endpoint:** [app/api/payments/webhook/route.ts](../app/api/payments/webhook/route.ts) — `POST /api/payments/webhook?provider=<id>`.
- Resolves the provider, calls `provider.verifyWebhook(request)` (**must verify the signature** and throw on tampering), then `confirmDonation(result.reference, result.status)`.
- Returns 501 for the `manual` provider (no unsigned completion path).

## Provider responsibilities
All provider-specific logic lives **inside provider classes** — nothing leaks out.

- **Interface:** [lib/payments/types.ts](../lib/payments/types.ts) — `PaymentProvider { id, createPayment(), verifyWebhook? }`.
- **Registry:** [lib/payments/index.ts](../lib/payments/index.ts) — `getPaymentProvider(method)`; register new gateways here.
- **Current:** [lib/payments/providers/manual.ts](../lib/payments/providers/manual.ts) — no-gateway placeholder (records `pending`, no `verifyWebhook`).

A provider must:
1. `createPayment()` → create the charge, return a `reference` + `redirectUrl`.
2. `verifyWebhook()` → verify the signature/checksum, return `{ reference, status }`.

## Admin responsibilities
Admins manage everything **except** individual donations:

✅ Campaign approval / rejection (with reason) · ✅ User verification · ✅ Withdrawal requests · ✅ Abuse reports / flags · ✅ Fraud investigation
❌ **Never** accept/reject individual donations — that is automatic.

(`admin_audit_log` is retained for logging the admin actions above; the donation accept/reject tool and its API endpoint were removed.)

## Withdrawal flow (separate from donations)
Creator requests a payout → admin reviews → state machine
(`pending_review → approved → paid`, or `rejected` / `info_requested`). Each
transition writes a `payout_request_events` row → `notify_on_payout_event`
notifies the campaign owner. A 3% platform commission is computed server-side.
See `payouts.sql`, `payout-notifications.sql`, `payout-commission.sql`.

## Future gateway integration (Payme / Click / Uzcard / Humo)
1. Add `lib/payments/providers/<name>.ts` implementing `PaymentProvider` (incl. `verifyWebhook`).
2. Register it in the `providers` map in [lib/payments/index.ts](../lib/payments/index.ts).
3. Add gateway credentials as **server-only** env vars (never `NEXT_PUBLIC_*`).
4. Point the gateway's webhook at `/api/payments/webhook?provider=<name>`.
5. No changes to the donation API, `confirmDonation`, triggers, or UI — the
   abstraction picks the provider up automatically.
