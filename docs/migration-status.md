# Xayr — Migration Status

How to confirm which of the 46 database migrations ([supabase/MIGRATIONS.md](../supabase/MIGRATIONS.md))
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
| 32 | admin-workflow.sql | `campaigns.rejection_reason`; `admin_stats.revenue` (view re-created with revenue) |
| 33 | email-verification-gate.sql | fn `is_email_confirmed`; `users.email_confirmed`; trigger `on_auth_email_confirmed` |
| 34 | usernames.sql | `users.username`; table `reserved_usernames`; fn `change_username` |
| 35 | usernames-rules.sql | `username_format_ok` source enforces the stricter rules (no consecutive periods — `[.][.]`) |
| 36 | campaign-create-email-gate.sql | policy `campaigns_insert_own` (**superseded by #37** — same name, re-created there) |
| 37 | campaign-create-kyc-gate.sql | `enforce_campaign_publish` source references `is_verified` (KYC publish gate) |
| 38 | payment-foundation.sql | table `payment_events`; unique indexes `donations_payment_ref_key`,`payment_events_provider_event_key` |
| 39 | payment-refund-reversal.sql | `apply_donation` source reverses totals on un-complete (`greatest(0, current_amount …)`) |
| 40 | payout-info.sql | table `payout_accounts`; `payout_requests.snap_card_number`; policy `payout_accounts_select_own_admin` |
| 41 | campaign-expiration.sql | fn `expire_due_campaigns`; `campaigns_status_check` allows `funded`/`expired`; trigger `trg_notify_owner_campaign_expiry` |
| 42 | campaign-extensions.sql | table `campaign_extension_requests`; `campaigns.extension_count`; fns `approve_campaign_extension`,`get_campaign_extension_history` |
| 43 | completion-reports-v2.sql | `campaign_reports.status`,`campaign_reports.fund_breakdown`; fns `review_completion_report`,`campaign_total_withdrawn` |
| 44 | guest-donations.sql | `donations.donor_name`,`donations.name_display` |
| 45 | financial-ledger.sql | table `financial_ledger`; view `financial_summary`; fns `public_financial_stats`,`check_financial_integrity`,`campaign_financials`,`record_ledger_adjustment`; trigger `trg_ledger_on_donation`; append-only guard `trg_ledger_no_delete` |
| 46 | financial-snapshots.sql | table `financial_snapshots`; fns `generate_financial_snapshot`,`reconciliation_report`,`public_financial_series`; `financial_ledger.user_id`/`reference_id`; trigger `trg_ledger_payout_lifecycle` |

## Live status (fill in after running the verifier)

> Paste the Section 1 rollup here once you've run it against production. Until
> then, status is **unknown** — the script is the source of truth, not this table.

| # | Migration | Live status | Notes |
|---|-----------|-------------|-------|
| 1 | schema.sql | _unverified_ | |
| 2 | verification.sql | _unverified_ | |
| … | … | _unverified_ | run `verify-migrations.sql` to populate |
| 46 | financial-snapshots.sql | _unverified_ | newest — daily snapshots + ledger extension + reconciliation report (run before the charts/snapshot cron go live) |

## Notes / known dependencies

- **#5 is a security prerequisite for #18** — `secure-donations-rls.sql` makes `campaigns.current_amount` tamper-proof; don't enable payouts without it.
- **#21 column grant** — if the donor-stats privacy toggle returns `permission denied`, an older `donor-profiles.sql` (without `grant update (donor_stats_public)`) was applied. Re-run #21.
- **#27 / #29** are operational: they also need dashboard config (Google provider; OneSignal app + Supabase webhook) — see [docs/push-notifications-setup.md](push-notifications-setup.md).
- **Payments:** no real gateway is integrated (only the `manual` provider). The manual admin-completion tool was **removed** (#31 notes), so there is currently **no in-app path** to move a donation to `completed` — only a direct service-role DB write or a future gateway webhook (#38 builds the foundation: `payment_ref` UNIQUE + `payment_events` dedupe/audit).
- **#38 → #39** payment safety: #39 makes `apply_donation` **reverse** campaign totals when a `completed` donation later goes `refunded`/`failed` (floored at 0). Apply both before enabling any gateway.
- **#40** depends on `payouts.sql` (#18) + `payout-commission.sql` (#26): adds the secure `payout_accounts` table and the `snap_*` snapshot columns on `payout_requests`.
- **#41 → #42** campaign lifecycle: #41 adds the `expired`/`funded`/`cancelled` statuses + `expire_due_campaigns()` (driven by the Vercel cron `/api/cron/expire-campaigns`, needs `CRON_SECRET`); #42 (the extension workflow) **requires #41**.
- **#43** (moderated completion reports) requires #8 + #14; existing v1 reports are grandfathered as `approved`. **#44** (guest donations) requires `campaign-donors-view.sql` (#7).
- The verifier checks **representative** objects per migration (enough to detect applied/partial/missing), not every index/policy. A `⚠️ PARTIAL` is your cue to open the file and re-run it.
