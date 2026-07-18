# Xayr — Database Migration Runbook

Run each file **in this order** in the Supabase Dashboard → SQL Editor.
Every file is idempotent (safe to re-run). Features whose migration has not
been run degrade gracefully in the app but stay **inactive** until applied.

## Run order

| # | File | Enables | Status check |
|---|------|---------|--------------|
| 1 | `schema.sql` (or `000_master_migration.sql`) | Core tables, RLS, triggers | `users`, `campaigns` tables exist |
| 2 | `verification.sql` | KYC tables, publish gate, **users column-level grants** | `verification_requests` exists |
| 3 | `add-user-verification-fields.sql` | `verified_at` / `rejection_reason` on users | columns exist |
| 4 | `remove-phone-verification.sql` | Drops SMS/OTP leftovers | — |
| 5 | `secure-donations-rls.sql` | **Tamper-proof donations** (clients can only insert `pending`) | required before payouts |
| 6 | `secure-campaign-fields-rls.sql` | Protected campaign columns hardening | — |
| 7 | `campaign-donors-view.sql` | `campaign_donors` view (donor lists) | view exists |
| 8 | `campaign-completion-reports.sql` | Completion reports + `campaign-reports` bucket | `campaign_reports` exists |
| 9 | `admin-dashboard.sql` | `admin_stats` view | view exists |
| 10 | `optimize-campaign-indexes.sql` | Listing performance indexes | — |
| 11 | `add-campaign-images.sql` | `campaigns.images[]` | column exists |
| 12 | `add-preferred-language.sql` | `users.preferred_language` | column exists |
| 13 | `campaign-flags.sql` | Report-campaign feature | `campaign_flags` exists |
| 14 | `donor-notifications.sql` | Donor notifications (updates/completed/reports/goal) | triggers exist |
| 15 | `campaign-updates-attachments.sql` | Update photos/receipts | `campaign_updates.images` exists |
| 16 | `campaign-views.sql` | View tracking (`increment_campaign_views`) | function exists |
| 17 | `recently-viewed.sql` | Logged-in recently-viewed history | `recently_viewed` exists |
| 18 | `payouts.sql` | Withdrawal system (tables + state machine) | `payout_requests` exists |
| 19 | `payout-notifications.sql` | Creator payout-status notifications | trigger exists |
| 20 | `creator-followers.sql` | Follow creators + launch notifications | `creator_followers` exists |
| 21 | `donor-profiles.sql` | Donor stats + privacy toggle (**includes the `donor_stats_public` column grant — re-run if applied before 2026-06-11**) | `get_donor_stats` exists |
| 22 | `profile-photos.sql` | Avatar uploads (`profile-photos` bucket) | bucket exists |
| 23 | `campaign-teams.sql` | Team campaigns (roles, team-aware RLS) | `campaign_team_members` exists |
| 24 | `contact-messages.sql` | Contact form storage + admin inbox | `contact_messages` exists |
| 25 | `campaign-resubmit.sql` | Resubmit rejected campaigns | `resubmit_campaign` exists |
| 26 | `payout-commission.sql` | Withdrawal commission columns (`commission_amount`, `payout_amount`) + `payout_commission_sum` CHECK. **The rate is set by #51 (4%)**; this file's 5-arg `create_payout_request` is dropped by #40. | `payout_requests.commission_amount` exists |
| 27 | `google-oauth.sql` | Google sign-in profile creation (coalesces `name`/`picture`) — run after enabling the Google provider in the dashboard | Google signups get name + avatar |
| 28 | `platform-notifications.sql` | Owner notifications on campaign submit/approve/reject/pause + verification submit/approve/reject (adds `'verification'` type) | creators/applicants get decision notifications |
| 29 | `push-notifications.sql` | Browser push preferences (`notification_preferences` table) for OneSignal delivery — see `docs/push-notifications-setup.md` | `notification_preferences` exists |
| 30 | `campaign-shares.sql` | Share tracking (`campaign_shares` table + `get_share_stats` RPC) for the Traffic Sources analytics | `campaign_shares` exists |
| 31 | `admin-donation-management.sql` | **Automatic** donor notification on donation completed/failed (`notify_on_donation_status` trigger) + `admin_audit_log` table (retained for future admin-action logging; the manual donation tool was removed) | trigger exists |
| 32 | `admin-workflow.sql` | Campaign `rejection_reason` + `admin_stats.revenue` + reject notification reason | `campaigns.rejection_reason` exists |
| 33 | `email-verification-gate.sql` | Email-confirmation publish gate (`is_email_confirmed`, `users.email_confirmed` mirror, publish trigger keyed to email) | `users.email_confirmed` exists |
| 34 | `usernames.sql` | Unique usernames (`users.username`, reserved list, `is_username_available`/`change_username`/`generate_username`, backfill + OAuth auto-assign) | `users.username` exists |
| 35 | `usernames-rules.sql` | Stricter username rules (no leading/trailing/consecutive `.`, no `__`); generator collapses repeats | `username_format_ok('a..b')` is false |
| 36 | `campaign-create-email-gate.sql` | Server-side: `campaigns_insert_own` requires a confirmed email (or admin) — superseded by #37 | — |
| 37 | `campaign-create-kyc-gate.sql` | Campaign create/publish gated on **KYC** (`verification_status='verified'`) instead of email — RLS insert + publish trigger | unverified-KYC insert is denied |
| 38 | `payment-foundation.sql` | `donations.payment_ref` UNIQUE index + `payment_events` table (idempotency/reconciliation/audit, admin-only read) | `payment_events` exists |
| 39 | `payment-refund-reversal.sql` | **Refund safety** — `apply_donation` reverses `current_amount`/`donors_count` (floored at 0) when a completed donation becomes refunded/failed, so refunded funds can't be withdrawn. Requires #5. | refund a completed test donation → `current_amount` returns to prior value |
| 40 | `payout-info.sql` | **Secure payout accounts** — `payout_accounts` table (card details, RLS owner+admin) + snapshot columns on `payout_requests`; `create_payout_request` now sources/snapshots payout info, requires it, and enforces a configurable minimum; `mark_payout_paid` accepts a payment date. Requires payouts.sql + payout-commission.sql. | `payout_accounts` exists; a withdrawal stores `snap_*` |
| 41 | `campaign-expiration.sql` | **Campaign expiration & archive** — adds `expired`/`funded`/`cancelled` statuses; widens `campaigns_select_public` so archived campaigns (`completed`/`expired`/`funded`) stay publicly readable (URLs + SEO keep working); `expire_due_campaigns()` flips active+past-deadline campaigns → `funded` (goal met) / `expired` (not met) using the guard-bypass pattern; owner notification trigger for expiry/funding. Drives the daily Vercel cron `/api/cron/expire-campaigns`. | new statuses accepted; `select public.expire_due_campaigns();` runs |
| 42 | `campaign-extensions.sql` | **Campaign extension workflow (self-contained)** — `campaigns.extension_count` + `original_deadline`; creates the `campaign_extension_requests` table (RLS read own/admin, writes via definer fns) **with** `reason`/`reason_category`; `request_campaign_extension(uuid,timestamptz,text,text)` (verified owner of an expired, under-goal campaign; reason required; ≤30 days; ≤2 extensions), `approve_campaign_extension()` (reactivates → `active` + new deadline, captures `original_deadline`, notifies owner **and previous donors**), `reject_campaign_extension()` (notify with reason), `cancel_campaign_extension()` (owner cancels their own **pending** request → `cancelled`; request status set is `pending`/`approved`/`rejected`/`cancelled`), `close_campaign()` (owner closes a goal-reached active campaign → `funded`), `get_campaign_extension_history()` (anon-readable timeline, dates only). A request never reactivates the campaign — only an admin approval does. Requires #41. Idempotent on fresh **and** older DBs. | `campaign_extension_requests` exists; approve flips status back to `active` |
| 43 | `completion-reports-v2.sql` | **Moderated completion reports (Phase 1)** — adds a moderation `status` to `campaign_reports` (pending/approved/changes_requested/rejected; **existing reports grandfathered as `approved`**) + `beneficiary_status`, `fund_breakdown`/`timeline` (jsonb), `videos`, `before_images`/`after_images`, `admin_feedback`, `reviewed_by/at`, `submitted_at`. RLS now shows **only approved** reports publicly (owner/admin see own/all); a guard trigger stops owners self-approving (edit → pending; approved → locked). Donor notification moves from submit → approval. `review_completion_report(id, action, feedback)` (admin: approve/request_changes/reject + notify owner & donors). `campaign_total_withdrawn(id)` (anon-readable, for the public transparency block). Requires #8 + #14. | `campaign_reports.status` exists; a new report is `pending` and not public |
| 44 | `guest-donations.sql` | **Guest donations** — adds `donor_name`/`donor_email`/`donor_phone` (PII; admin/owner-only via existing donations RLS) + `name_display` (`full`/`first`/`anonymous`) to `donations`; rebuilds the `campaign_donors` view to render the chosen display name for **both guests and registered users** (first-word for `first`, null for anonymous) and never expose email/phone. Requires `campaign-donors-view.sql`. | `donations.donor_name` exists; a guest 'full' donation shows its name in `campaign_donors` |
| 45 | `financial-ledger.sql` | **Financial ledger, summary & integrity** — immutable append-only `financial_ledger` (one row per money movement: donation/refund/platform_fee/provider_fee/withdrawal/adjustment/admin_correction; signed `amount`, `source_key` dedupe; UPDATE/DELETE blocked by a guard trigger; RLS read = admin + campaign owner). Auto-records via triggers on `donations` (completed → `donation`, un-complete → `refund`) and `payout_requests` (paid → `withdrawal` + `platform_fee`); **backfills** existing completed donations / refunds / paid payouts. `record_ledger_adjustment()` (admin + reason → ledger + `admin_audit_log`). `financial_summary` view (all platform totals + today/week/month/year, service-role). `public_financial_stats()` (anon, aggregated/PII-free). `check_financial_integrity()` (admin; returns only campaigns whose books don't reconcile). `campaign_financials()` (owner/admin per-campaign breakdown). Requires payouts.sql + payout-commission.sql + admin_audit_log (#31). | `financial_ledger` exists; a completed donation creates a `donation` row; `select * from public.public_financial_stats();` runs |
| 46 | `financial-snapshots.sql` | **Snapshots, ledger extension & reconciliation report** — extends `financial_ledger` (adds `user_id`/`reference_id`; widens the type enum: `campaign_credit`, granular `withdrawal_requested/approved/completed/cancelled`, `chargeback`) and records **0-amount** withdrawal-lifecycle events (balance math unaffected) + backfills them. Adds `financial_snapshots` table + `generate_financial_snapshot()` (**idempotent**, one row/day, never overwrites — driven by the daily Vercel cron `/api/cron/financial-snapshot`, reuses `CRON_SECRET`). `reconciliation_report()` (per-campaign accounting identity + `is_balanced`). Extends `public_financial_stats()` (adds avg/largest). `public_financial_series()` (monthly chart series, anon-safe). Requires #45. | `financial_snapshots` exists; `select public.generate_financial_snapshot();` returns a bool; `select * from public.reconciliation_report();` runs |
| 47 | `payment-provider-settings.sql` | **Payment provider catalog** — `payment_provider_settings` (text PK = provider id; `enabled`, `coming_soon`, `priority`, `is_default`; RLS select-all + admin-write; seeded: click active+default, payme/paynet/uzum coming-soon). Also **widens the `donations.payment_method` CHECK** with `paynet`/`uzum`. Drives `/admin/payments` and the donor method selector; `lib/payments/catalog.ts` fails open to safe defaults until applied. Requires #1. | `payment_provider_settings` exists and returns 4 seeded rows; `donations_payment_method_check` mentions `paynet` and `uzum` |
| 48 | `payme-transactions.sql` | **Payme merchant-API transaction state** — `payme_transactions` (`paycom_id` unique; `state` 1/2/-1/-2; ms `create/perform/cancel` timestamps echoed verbatim; cancel `reason`; **partial unique index** `payme_transactions_active_donation_key` = one ACTIVE txn per donation; RLS admin-read, service-role writes). Backs Create/Perform/Cancel/Check/GetStatement in `/api/payments/payme`. **REQUIRED before Payme is enabled** — without it every Payme JSON-RPC call fails. Requires #1, #39, #47. | `payme_transactions` exists; `payme_transactions_active_donation_key` index exists |
| 49 | `share-channels.sql` | **Share channels** — widens the `campaign_shares.source` CHECK **and** the `shares_insert_any` RLS with-check to allow `instagram`/`email`/`qr` (retains `x` so historical rows stay valid + reportable). Both must be widened: the CHECK alone is not enough. Until applied, those share rows are silently dropped — `trackShare` is fire-and-forget, so sharing itself never breaks. Requires #30. | `campaign_shares_source_check` mentions `instagram`, `email`, `qr`; the `shares_insert_any` policy does too |
| 50 | `financial-status-integrity.sql` | **Only successful donations count** — fixes `admin_stats.donations_count` (was `count(*)` over every status, inflating the /admin Donations tile with pending/failed/refunded) to completed-only, and adds independent `failed_payments_amount`/`failed_payments_count`/`refunded_count` to `financial_summary` so unsuccessful attempts are reported separately, never folded into a total. **View definitions only — no data modified.** Column order is load-bearing (`create or replace view` requires the existing prefix). Requires #45. | `admin_stats` definition mentions `completed`; `financial_summary` has `failed_payments_amount` |
| 51 | `payout-commission-4pct.sql` | **Withdrawal commission 3% → 4%** — replaces `create_payout_request(uuid,integer,text)` so new requests compute `commission_amount = round(amount * 0.04)`. Function body only: no columns, constraints, data, triggers or policies change, and the signature is unchanged. **Existing payout_requests are NOT re-rated** — historical rows keep the rate actually charged (0% pre-#26, 3% under #26..#50) and the `payout_commission_sum` CHECK keeps them reconciled. Donation flow untouched. Requires #40. | `pg_get_functiondef` for `create_payout_request` contains `0.04`; a new request stores 4% while old rows keep theirs |
| 52 | `payout-paid-balance-guard.sql` | **Payout pay-time balance guard (audit F-2)** — replaces `mark_payout_paid(uuid,text,timestamptz)` to re-verify at PAY time that `sum(paid payouts) + this ≤ campaigns.current_amount`, locking the campaign row, so a refund/reversal that reduced the balance after the request was created cannot over-withdraw. Raises `insufficient_balance` and leaves the request `approved` if not. Function body only: same signature, no schema/workflow/refund/balance change. Requires #40. | `pg_get_functiondef` for `mark_payout_paid` contains `insufficient_balance` |
| 53 | `users-pii-hardening.sql` | **users PII lockdown (audit P1-1)** — revokes blanket SELECT on `public.users` from anon/authenticated and re-grants only the 14 public-safe columns, so `email`/`phone`/`rejection_reason` become unreadable to clients. RLS policies, UPDATE grants, the service role and the `campaign_donors` view are all unchanged; PostgREST embedded joins keep working (they select only full_name/avatar_url/bio/username). Adds `my_private_profile()` (SECURITY DEFINER, `where id = auth.uid()`) for the owner-only phone / rejection_reason reads. No schema or data change. | `information_schema.column_privileges` for grantee `anon` on `users` contains no email/phone/rejection_reason |
| 54 | `rls-storage-hardening.sql` | **RLS + storage hardening (audit P2-3, P2-4)** — enables RLS on `reserved_usernames` (was the only table without it; PostgREST writes were possible → username squatting on reserved names like `admin`) with an admin-only manage policy; SECURITY DEFINER username checks are unaffected. Also scopes the `campaign-images` INSERT policy to the uploader’s own folder, matching profile-photos / campaign-reports / verification-documents. Read permissions unchanged. | `pg_class.relrowsecurity` true for `reserved_usernames`; `campaign_images_insert` with_check mentions `storage.foldername` |
| 55 | `fk-indexes.sql` | **Foreign-key indexes (audit P2-5)** — adds 8 missing indexes on FK columns (`campaign_updates.user_id`, `comments.user_id`, `campaign_reports.user_id`, `identity_documents.user_id`, `campaign_extension_requests.user_id`, `recently_viewed.campaign_id`, `payout_requests.reviewed_by`, `verification_requests.reviewed_by`). Unindexed FKs make every ON DELETE CASCADE/SET NULL a sequential scan of the child table. Additive only — no index dropped, none duplicated. **Uses CREATE INDEX CONCURRENTLY — run each statement individually** (cannot run inside a transaction block). | all 8 index names present in `pg_indexes`; no invalid indexes |

## Critical notes

- **#5 (`secure-donations-rls.sql`) is a security prerequisite** for the payout
  system (#18): it makes `campaigns.current_amount` tamper-proof. Do not enable
  payouts in production without it.
- **#21 (`donor-profiles.sql`)** was amended to add
  `grant update (donor_stats_public)` — `users` updates are governed by
  column-level grants (#2), so environments that ran an earlier version of #21
  must re-run it or the privacy toggle fails with `permission denied`.
- **Payment gateways are integrated (env-gated).** Click (SHOP API, callbacks at
  `/api/payments/click`) and Payme (Merchant API JSON-RPC at
  `/api/payments/payme`) are both implemented; the `manual` provider is only the
  fallback used when a gateway's merchant credentials are absent. Donations are
  completed by the verified server-to-server callback via `confirmDonation()` —
  never by hand. **Payme additionally requires #48**, without which every Payme
  JSON-RPC call fails. (This note previously claimed no gateway existed; that was
  stale.)
- **#42 was consolidated.** An earlier split put the extension details in
  `campaign-extension-details.sql`, which sorts **before** `campaign-extensions.sql`
  alphabetically (`-` < `s` after `campaign-extension`) — so a folder-order run
  applied the `ALTER`s before the `CREATE TABLE` and failed with
  `42P01 relation "public.campaign_extension_requests" does not exist`. Everything
  now lives in the single self-contained `campaign-extensions.sql`; the details
  file was removed. Just (re-)run `campaign-extensions.sql` — it is idempotent and
  creates the table plus all columns/functions.
- **#41 (`campaign-expiration.sql`) needs a scheduler** to flip due campaigns.
  The app ships a Vercel Cron (`vercel.json` → `/api/cron/expire-campaigns`,
  daily) — set a `CRON_SECRET` env var so the endpoint authenticates the
  scheduled call. Alternatively, enable `pg_cron` and use the commented
  `cron.schedule(...)` snippet at the bottom of the migration. Until a scheduler
  runs, statuses still flip lazily-enough for correctness because the donation
  API and the donate UI both treat a past deadline as ended regardless.
