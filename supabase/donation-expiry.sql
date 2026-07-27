-- ============================================================
-- #62 — Donation lifecycle: 'expired' + 'cancelled' statuses
--
-- PROBLEM
--   A donor who opens a payment page and closes it without paying leaves a
--   'pending' donation behind forever. Those abandoned rows accumulated in the
--   admin queue and the admin nav badge, so the badge count grew without bound
--   and admins could not tell which pending payments actually needed a human.
--
-- WHAT THIS DOES
--   1. Widens the donations.status CHECK to allow 'expired' and 'cancelled'.
--      A daily sweep (/api/cron/expire-donations) moves a 'pending' donation to
--      'expired' once it is older than DONATION_EXPIRY_HOURS (default 72h).
--   2. Adds a partial index so that sweep — and the admin badge count — never
--      scan the donations table.
--
-- SAFETY / INVARIANTS
--   • NOTHING IS EVER DELETED. Expiry is a status change only; every expired row
--     is retained in full for audit history, fraud investigation, payment
--     troubleshooting and analytics.
--   • NO MONEY MOVES. The apply_donation() trigger credits campaign totals only
--     when a donation BECOMES 'completed', and reverses only when it LEAVES
--     'completed'. 'pending' → 'expired' touches neither branch, so
--     current_amount, donors_count, balances and the ledger are all unaffected.
--   • LATE PAYMENTS STILL LAND. 'expired' is NOT terminal for crediting: a
--     verified provider callback can still move 'expired' → 'completed', at
--     which point apply_donation() credits it exactly once (old.status is
--     distinct from 'completed'). See lib/payments/confirm.ts.
--   • Existing rows only ever hold pending/completed/failed/refunded — all still
--     permitted — so the widened constraint validates with no data change.
--
-- 'cancelled' is added so the lifecycle is representable and filterable in the
-- admin UI. The Click/Payme routes deliberately still record a provider-side
-- cancellation as 'failed' (unchanged behaviour): financial reporting counts
-- failed_payments_* off 'failed', and silently splitting cancellations into a
-- status those queries don't know about would under-report them. Introducing the
-- value now makes that split a one-line change later.
--
-- Run in: Supabase Dashboard → SQL Editor. Idempotent — safe to re-run.
-- Requires: schema.sql (donations table). Independent of every other migration.
-- ============================================================

-- ── 1. Allow the two new lifecycle states ───────────────────
-- The original CHECK was declared inline in create table, so Postgres named it
-- donations_status_check. Drop and re-add with the widened value set.
alter table public.donations
  drop constraint if exists donations_status_check;

alter table public.donations
  add constraint donations_status_check
  check (status in ('pending','completed','failed','refunded','cancelled','expired'));

-- ── 2. Index the expiry sweep + the admin badge count ───────
-- PARTIAL on status='pending': the index contains ONLY pending rows, which is a
-- small, self-limiting set (the sweep drains it daily). Both hot queries are
--   ... where status='pending' and created_at < / between …
-- so they become a bounded index range scan instead of a table scan. Completed
-- donations — the overwhelming majority of the table forever — are not indexed
-- here at all, keeping it tiny.
create index if not exists idx_donations_pending_created
  on public.donations (created_at)
  where status = 'pending';

-- Reload PostgREST's schema cache so the new statuses are accepted immediately.
notify pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────
--   -- the widened constraint is present:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'donations_status_check';
--   -- expect: CHECK (status = ANY (ARRAY['pending','completed','failed',
--   --                                    'refunded','cancelled','expired']))
--
--   -- the partial index exists:
--   select indexdef from pg_indexes
--    where indexname = 'idx_donations_pending_created';
--
--   -- 'expired' is now a legal status (rolled back, writes nothing):
--   begin;
--     update public.donations set status = 'expired'
--      where status = 'pending' returning id, status;
--   rollback;
--
--   -- no row was lost or reclassified by this migration:
--   select status, count(*) from public.donations group by status order by 1;
