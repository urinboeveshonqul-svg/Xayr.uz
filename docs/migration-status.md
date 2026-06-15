# Xayr — Migration Status

How to confirm which of the 31 database migrations ([supabase/MIGRATIONS.md](../supabase/MIGRATIONS.md))
are actually live in the Supabase project. This is **read-only** — it never
changes the database. Fill in the "Live status" column after running the script.

## How to verify

1. Open **Supabase Dashboard → SQL Editor**.
2. Paste **[supabase/verify-migrations.sql](../supabase/verify-migrations.sql)** and **Run**.
3. Read the three result tables:
   - **Section 1 — rollup:** one row per migration → `✅ APPLIED` / `⚠️ PARTIAL` / `❌ MISSING`.
   - **Section 2 — detail:** every individual object check, so you can see exactly what's missing in a `⚠️ PARTIAL`.
   - **Section 3 — key features:** direct answer for notifications, payouts, donor profiles, shares, push, reports, teams.
4. For any `❌ MISSING` / `⚠️ PARTIAL`, run that migration file from `supabase/` in the SQL Editor, then re-run the verifier.

> **Status meanings**
> - **✅ APPLIED** — every checked object for that migration exists.
> - **⚠️ PARTIAL** — some objects exist, some don't. Usually means an *older version* of the migration was run, or it failed midway. Re-run the file (all migrations are idempotent).
> - **❌ MISSING** — none of the objects exist; the migration was never run.

## What each migration is verified by

| # | Migration | Verified by (key objects) |
|---|-----------|---------------------------|
| 1 | schema.sql | tables `users`,`campaigns`,`donations`,`notifications`; fns `apply_donation`,`is_admin`; triggers `on_auth_user_created`,`trg_apply_donation` |
| 2 | verification.sql | tables `verification_requests`,`identity_documents`; `users.verification_status`; fn `is_verified`; trigger `trg_enforce_publish`; bucket `verification-documents` |
| 3 | add-user-verification-fields.sql | `users.verified_at`, `users.rejection_reason` |
| 4 | remove-phone-verification.sql | `phone_verifications` table is **absent** |
| 5 | secure-donations-rls.sql | policy `donations_insert_pending` present **and** `donations_insert_any` removed |
| 6 | secure-campaign-fields-rls.sql | fn `guard_campaign_protected_fields`; trigger `trg_campaign_field_guard` |
| 7 | campaign-donors-view.sql | view `campaign_donors` |
| 8 | campaign-completion-reports.sql | table `campaign_reports`; bucket `campaign-reports` |
| 9 | admin-dashboard.sql | view `admin_stats` |
| 10 | optimize-campaign-indexes.sql | `pg_trgm` extension; indexes `idx_campaigns_title_trgm`,`idx_campaigns_active_new` |
| 11 | add-campaign-images.sql | `campaigns.images`; bucket `campaign-images` |
| 12 | add-preferred-language.sql | `users.preferred_language` |
| 13 | campaign-flags.sql | table `campaign_flags` |
| 14 | donor-notifications.sql | fns `notify_on_campaign_milestone`,`notify_donors_on_update`,`notify_donors_on_report` |
| 15 | campaign-updates-attachments.sql | `campaign_updates.images`,`campaign_updates.documents` |
| 16 | campaign-views.sql | fns `increment_campaign_views`,`record_campaign_view` |
| 17 | recently-viewed.sql | table `recently_viewed` |
| 18 | payouts.sql | tables `payout_requests`,`payout_request_events`; fns `create_payout_request`,`approve_payout_request` |
| 19 | payout-notifications.sql | fn `notify_on_payout_event`; trigger `trg_notify_payout_event` |
| 20 | creator-followers.sql | table `creator_followers`; fn `notify_followers_on_campaign_launch` |
| 21 | donor-profiles.sql | fn `get_donor_stats`; `users.donor_stats_public`; **column UPDATE grant** |
| 22 | profile-photos.sql | bucket `profile-photos` |
| 23 | campaign-teams.sql | table `campaign_team_members`; fn `campaign_role` |
| 24 | contact-messages.sql | table `contact_messages` |
| 25 | campaign-resubmit.sql | fn `resubmit_campaign` |
| 26 | payout-commission.sql | `payout_requests.commission_amount`,`payout_amount` |
| 27 | google-oauth.sql | `handle_new_user` source references `picture` (the coalesce amendment) |
| 28 | platform-notifications.sql | fns `notify_owner_on_campaign_status`,`notify_on_verification_decision`; `'verification'` allowed by `notifications_type_check` |
| 29 | push-notifications.sql | table `notification_preferences` |
| 30 | campaign-shares.sql | table `campaign_shares`; fn `get_share_stats` |
| 31 | admin-donation-management.sql | table `admin_audit_log`; fn `notify_on_donation_status`; trigger `trg_notify_donation_status` |

## Live status (fill in after running the verifier)

> Paste the Section 1 rollup here once you've run it against production. Until
> then, status is **unknown** — the script is the source of truth, not this table.

| # | Migration | Live status | Notes |
|---|-----------|-------------|-------|
| 1 | schema.sql | _unverified_ | |
| 2 | verification.sql | _unverified_ | |
| … | … | _unverified_ | run `verify-migrations.sql` to populate |
| 31 | admin-donation-management.sql | _unverified_ | newest — added with the admin donations tool |

## Notes / known dependencies

- **#5 is a security prerequisite for #18** — `secure-donations-rls.sql` makes `campaigns.current_amount` tamper-proof; don't enable payouts without it.
- **#21 column grant** — if the donor-stats privacy toggle returns `permission denied`, an older `donor-profiles.sql` (without `grant update (donor_stats_public)`) was applied. Re-run #21.
- **#27 / #29** are operational: they also need dashboard config (Google provider; OneSignal app + Supabase webhook) — see [docs/push-notifications-setup.md](push-notifications-setup.md).
- **Payments:** no real gateway is integrated (only the `manual` provider). Completed donations are created via the service role — either the admin tool (#31, `/admin/donations`) or a future gateway webhook.
- The verifier checks **representative** objects per migration (enough to detect applied/partial/missing), not every index/policy. A `⚠️ PARTIAL` is your cue to open the file and re-run it.
