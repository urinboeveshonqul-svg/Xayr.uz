-- ============================================================
-- XAYR — Financial status integrity (migration #50)
-- ============================================================
-- Enforces the rule that ONLY successfully completed donations affect totals.
--
-- The audit found the aggregation layer already correct almost everywhere
-- (campaign totals via apply_donation, financial_summary, financial_ledger,
-- snapshots, public_financial_stats, get_donor_stats, campaign_donors,
-- reconciliation) — with ONE exception, fixed here:
--
--   1. admin_stats.donations_count counted `count(*) from donations`, i.e.
--      pending + failed + refunded donations were included in the "Donations"
--      metric on the /admin dashboard. It now counts completed only.
--
-- It also adds the independently-calculated failure metrics the admin dashboard
-- needs, so successful money is never mixed with unsuccessful attempts:
--
--   2. financial_summary gains failed_payments_amount / failed_payments_count
--      and refunded_count.
--
-- NOTE ON STATUSES: donations.status is ('pending','completed','failed',
-- 'refunded') — there is no separate 'cancelled' or 'expired' state. Donor
-- cancellations, expired sessions, rejected and timed-out payments are all
-- recorded as 'failed' (see the Click and Payme callback routes), so excluding
-- 'failed' excludes all of them.
--
-- Run in: Supabase Dashboard -> SQL Editor (after financial-ledger.sql).
-- Idempotent. Read-only definitions — no data is modified.
-- ============================================================

-- ── 1. admin_stats: count SUCCESSFUL donations only ─────────────────────────
-- Re-declares the view exactly as admin-workflow.sql (#32) does, with the
-- donations_count fix. Kept as a full definition so this migration is
-- self-contained and idempotent.
create or replace view public.admin_stats
  with (security_invoker = false) as
select
  (select count(*) from public.users)::int                                                   as users_count,
  (select count(*) from public.campaigns)::int                                               as campaigns_count,
  (select count(*) from public.campaigns where status = 'active')::int                       as active_count,
  (select count(*) from public.campaigns where status = 'pending')::int                      as pending_count,
  (select count(*) from public.campaigns where status = 'completed')::int                    as completed_count,
  -- FIXED: was count(*) over every status (pending/failed/refunded inflated it).
  (select count(*) from public.donations where status = 'completed')::int                    as donations_count,
  (select coalesce(sum(amount), 0) from public.donations where status = 'completed')::bigint as total_raised,
  (select coalesce(sum(commission_amount), 0) from public.payout_requests where status = 'paid')::bigint as revenue;

revoke all on public.admin_stats from anon, authenticated;
grant select on public.admin_stats to service_role;

-- ── 2. financial_summary: independent unsuccessful-payment metrics ──────────
-- Every successful metric below is unchanged (completed-only). The new columns
-- are reported SEPARATELY and never folded into any total.
--
-- COLUMN ORDER IS LOAD-BEARING: `create or replace view` requires the existing
-- columns to keep the same names, types AND positions — new columns may only be
-- APPENDED to the end (Postgres errors 42P16 otherwise). So the 19 columns from
-- #45 stay byte-for-byte in their original order and the three new ones are
-- appended last. lib/finance.ts reads columns by name, so order is irrelevant
-- to the app. This avoids a `drop view` (nothing depends on it today, but a
-- drop would silently take dependents with it via CASCADE).
create or replace view public.financial_summary
  with (security_invoker = false) as
select
  (select coalesce(sum(amount), 0) from public.donations where status = 'completed')::bigint as total_donations_amount,
  (select count(*) from public.donations where status = 'completed')::int                     as donations_count,
  (select coalesce(sum(amount), 0) from public.donations where status = 'refunded')::bigint    as refunded_amount,
  (select coalesce(sum(amount), 0) from public.donations where status = 'pending')::bigint     as pending_payments_amount,
  (select count(*) from public.donations where status = 'pending')::int                        as pending_payments_count,
  (select coalesce(sum(amount), 0) from public.payout_requests where status = 'paid')::bigint            as withdrawn_gross,
  (select coalesce(sum(payout_amount), 0) from public.payout_requests where status = 'paid')::bigint     as net_to_creators,
  (select coalesce(sum(commission_amount), 0) from public.payout_requests where status = 'paid')::bigint as platform_fees_collected,
  0::bigint                                                                                              as provider_fees_collected,
  (select coalesce(sum(amount), 0) from public.payout_requests
     where status in ('pending_review','approved','info_requested'))::bigint                            as pending_withdrawals_amount,
  (select count(*) from public.payout_requests
     where status in ('pending_review','approved','info_requested'))::int                               as pending_withdrawals_count,
  greatest(0,
    (select coalesce(sum(current_amount), 0) from public.campaigns)
    - (select coalesce(sum(amount), 0) from public.payout_requests
         where status in ('pending_review','approved','info_requested','paid'))
  )::bigint                                                                                              as available_for_withdrawal,
  (select coalesce(max(amount), 0) from public.donations where status = 'completed')::bigint            as largest_donation,
  (select coalesce(round(avg(amount)), 0) from public.donations where status = 'completed')::bigint     as avg_donation,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('day', now()))::bigint                     as today_amount,
  (select count(*) from public.donations
     where status = 'completed' and created_at >= date_trunc('day', now()))::int                        as today_count,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('week', now()))::bigint                    as week_amount,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('month', now()))::bigint                   as month_amount,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('year', now()))::bigint                    as year_amount,
  -- ── NEW in #50 — appended last (see the column-order note above) ──────────
  -- Unsuccessful attempts, each counted independently. Never part of a total.
  (select count(*) from public.donations where status = 'refunded')::int                                as refunded_count,
  -- 'failed' covers cancelled / expired / rejected / timed-out attempts.
  (select coalesce(sum(amount), 0) from public.donations where status = 'failed')::bigint               as failed_payments_amount,
  (select count(*) from public.donations where status = 'failed')::int                                  as failed_payments_count;

revoke all on public.financial_summary from anon, authenticated;
grant select on public.financial_summary to service_role;

-- ============================================================
-- VERIFY (a pending/failed donation must not move these):
--   select donations_count, total_raised from public.admin_stats;
--   select donations_count, total_donations_amount,
--          pending_payments_count, failed_payments_count, refunded_count
--     from public.financial_summary;
--   -- donations_count must equal:
--   select count(*) from public.donations where status = 'completed';
-- ============================================================
