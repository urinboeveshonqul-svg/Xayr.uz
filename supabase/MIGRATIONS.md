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
| 26 | `payout-commission.sql` | 3% platform commission on withdrawals | `payout_requests.commission_amount` exists |
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
| 42 | `campaign-extensions.sql` | **Campaign extension workflow** — `campaigns.extension_count` + `campaign_extension_requests` table (RLS read own/admin, writes via definer fns); `request_campaign_extension()` (verified owner of an expired, under-goal campaign; ≤30 days; ≤2 extensions), `approve_campaign_extension()` (reactivates → `active` + new deadline + notify), `reject_campaign_extension()` (notify with reason). Requires #41. | `campaign_extension_requests` exists; approve flips status back to `active` |

## Critical notes

- **#5 (`secure-donations-rls.sql`) is a security prerequisite** for the payout
  system (#18): it makes `campaigns.current_amount` tamper-proof. Do not enable
  payouts in production without it.
- **#21 (`donor-profiles.sql`)** was amended to add
  `grant update (donor_stats_public)` — `users` updates are governed by
  column-level grants (#2), so environments that ran an earlier version of #21
  must re-run it or the privacy toggle fails with `permission denied`.
- Payment gateways (Click/Payme) are **not integrated** — only the `manual`
  provider exists, which records donations as `pending` and never completes
  them. Until a gateway (or an admin confirmation tool) is added, completed
  donations can only be created by updating `donations.status` with the
  service role.
- **#41 (`campaign-expiration.sql`) needs a scheduler** to flip due campaigns.
  The app ships a Vercel Cron (`vercel.json` → `/api/cron/expire-campaigns`,
  daily) — set a `CRON_SECRET` env var so the endpoint authenticates the
  scheduled call. Alternatively, enable `pg_cron` and use the commented
  `cron.schedule(...)` snippet at the bottom of the migration. Until a scheduler
  runs, statuses still flip lazily-enough for correctness because the donation
  API and the donate UI both treat a past deadline as ended regardless.
