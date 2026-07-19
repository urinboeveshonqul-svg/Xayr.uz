-- ============================================================
-- XAYR — Donation insert hardening (migration #57, audit MEDIUM: donation policy)
-- ============================================================
-- PROBLEM
--   `donations_insert_pending` (schema.sql / secure-donations-rls.sql, #5) lets
--   anon/authenticated clients INSERT pending donations directly through
--   PostgREST with the public anon key — bypassing the /api/donations route's
--   Turnstile, per-IP rate limiting and length validation. The app never uses
--   that path: every donation is created SERVER-SIDE by /api/donations via the
--   service-role client (which bypasses RLS). The permissive client insert policy
--   is therefore an unused write surface enabling pending-row / free-text spam.
--
-- FIX
--   1. DROP the client insert policy. Donations can then ONLY be created by the
--      service role (the API). No client insert/update/delete policy remains — so
--      donation rows are fully API-mediated, exactly like payout_requests. The
--      donations_select_scoped read policy (donor / owner / admin) is UNCHANGED.
--   2. Add a defensive message-length CHECK as a DB backstop (the API already
--      caps message at 300; the table had no limit). Added NOT VALID so it can
--      never fail on legacy rows while still enforcing every new insert/update.
--
-- COMPATIBILITY
--   • /api/donations uses createAdminClient() (service role) → unaffected by RLS.
--   • Guest donations still work — they too go through /api/donations.
--   • No client component inserts into donations (verified across app/components).
--   • Supersedes the insert policy from #5: on a fresh install #5 creates it and
--     this migration drops it. Run AFTER #5 (its migration number guarantees the
--     order). Re-running #5 later would recreate the policy — re-run this after.
--
-- Idempotent. No data is modified. Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================

-- 1. Remove the client insert path (both historical policy names).
drop policy if exists donations_insert_pending on public.donations;
drop policy if exists donations_insert_any     on public.donations;

-- 2. DB backstop for message length. The API enforces 300; 2000 bounds any other
--    write path generously without risking existing rows (NOT VALID skips the
--    one-time validation of legacy rows but enforces all new inserts/updates).
alter table public.donations drop constraint if exists donations_message_len;
alter table public.donations
  add constraint donations_message_len
  check (message is null or char_length(message) <= 2000) not valid;

-- ============================================================
-- VERIFY (read-only):
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='donations' order by policyname;
--   -- expect NO donations_insert_* policy (only donations_select_scoped remains).
--
--   select conname from pg_constraint where conname = 'donations_message_len';
--   -- expect one row.
-- ============================================================
