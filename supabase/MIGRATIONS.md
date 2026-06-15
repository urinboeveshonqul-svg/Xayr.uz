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
| 31 | `admin-donation-management.sql` | Admin donation tool: `admin_audit_log` table + donor confirm/reject notification trigger | `admin_audit_log` exists |

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
