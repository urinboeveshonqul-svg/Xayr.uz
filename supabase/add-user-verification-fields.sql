-- ============================================================
-- XAYR — Profile verification visibility fields
-- Adds verified_at + rejection_reason to public.users so the profile page
-- can display the admin's review decision directly.
--
-- These columns are SERVER-WRITABLE ONLY: they are intentionally NOT added to
-- the `authenticated` UPDATE grant (see verification.sql), so only the service
-- role (admin verification API) can set them.
--
-- Run in: Supabase Dashboard → SQL Editor (after verification.sql). Safe to re-run.
-- ============================================================

-- New denormalized fields for profile display.
alter table public.users
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

-- verification_status already exists (verification.sql); re-asserted here so this
-- migration is self-contained. `if not exists` makes it a no-op when present.
alter table public.users
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected'));
