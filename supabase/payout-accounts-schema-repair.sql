-- ============================================================
-- XAYR — payout_accounts schema repair (migration #59)
-- ============================================================
-- SYMPTOM
--   Saving payout information fails with:
--     Could not find the 'card_number' column of 'payout_accounts' in the schema cache
--
-- ROOT CAUSE
--   The application, TypeScript types, and the create_payout_request RPC are all
--   correct and consistently use `card_number` — the intended schema (#40,
--   payout-info.sql) defines `payout_accounts.card_number text not null`. The
--   LIVE database is out of sync, one of two ways:
--     (1) payout_accounts was created by an earlier / partial run BEFORE
--         card_number existed. `create table if not exists` does NOT add columns
--         to a table that already exists, so re-running #40 never repairs it — the
--         column stays missing.
--     (2) The column exists but PostgREST's schema cache is stale (common right
--         after a migration), so the REST API can't see it yet.
--
-- FIX (idempotent; safe whichever the cause; renames/redesigns nothing)
--   1. Ensure the table exists with the full #40 definition.
--   2. Backfill any MISSING columns via ADD COLUMN IF NOT EXISTS — this is what
--      actually repairs a table that predates card_number. Added nullable so it
--      can never fail on existing rows; the app already enforces these fields at
--      the form/validation layer, and new inserts always supply them.
--   3. Reload PostgREST's cached schema so a just-added (or previously invisible)
--      column is immediately visible to the REST API — this alone fixes cause (2).
--
--   RLS policies + the touch trigger from #40 do not depend on card_number and are
--   left untouched; if they are ALSO missing, re-run payout-info.sql (#40) — but
--   note #40 alone cannot add card_number to an already-existing table, which is
--   why this repair exists.
--
-- Depends on: schema.sql (users), payouts.sql, payout-info.sql (#40).
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Create the table if it is entirely absent (full definition — matches #40).
create table if not exists public.payout_accounts (
  user_id          uuid        primary key references public.users(id) on delete cascade,
  full_legal_name  text        not null,
  phone_number     text        not null,                       -- E.164: +998XXXXXXXXX
  card_type        text        not null check (card_type in ('uzcard','humo')),
  card_number      text        not null,                       -- 16 digits, no spaces (RLS-protected)
  cardholder_name  text        not null,
  bank_name        text,                                       -- optional
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2. Repair an already-existing table: add any column that is missing. The
--    create-if-not-exists above is a no-op when the table exists, so THIS is the
--    step that restores card_number on a table created before it existed. Columns
--    are added nullable to guarantee success regardless of existing rows.
alter table public.payout_accounts add column if not exists full_legal_name  text;
alter table public.payout_accounts add column if not exists phone_number     text;
alter table public.payout_accounts add column if not exists card_type        text;
alter table public.payout_accounts add column if not exists card_number      text;
alter table public.payout_accounts add column if not exists cardholder_name  text;
alter table public.payout_accounts add column if not exists bank_name        text;
alter table public.payout_accounts add column if not exists created_at       timestamptz not null default now();
alter table public.payout_accounts add column if not exists updated_at       timestamptz not null default now();

-- 3. Reload PostgREST's schema cache so the REST API sees card_number immediately.
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFY (read-only):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='payout_accounts'
--    order by column_name;
--   -- expect card_number (+ the other 8 columns) present.
--
--   -- then, as the signed-in owner, saving payout info must succeed instead of
--   -- "Could not find the 'card_number' column ... in the schema cache".
-- ============================================================
