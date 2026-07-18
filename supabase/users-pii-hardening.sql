-- ============================================================
-- XAYR — public.users PII hardening (migration #53, audit P1-1 / rls-audit F1)
-- ============================================================
-- PROBLEM
--   `users_select_all ... using (true)` makes EVERY column of public.users
--   readable by anyone holding the anon key (which ships in the browser bundle):
--   email, phone and rejection_reason included. That is full-table PII
--   enumeration of every donor and creator.
--
--   RLS is ROW-level and cannot hide columns, so the policy alone can never fix
--   this. The fix is COLUMN-level privileges.
--
-- FIX
--   1. Revoke the blanket SELECT grant on public.users from anon/authenticated.
--   2. Re-grant SELECT on the PUBLIC-SAFE columns only. Everything the public UI
--      reads (creator names, avatars, usernames, bios, verification badges) keeps
--      working, including PostgREST embedded joins — every embedded join in the
--      app selects only full_name / avatar_url / bio / username.
--   3. email, phone and rejection_reason are no longer selectable by anon or
--      authenticated AT ALL. The two places the owner legitimately needs their own
--      phone / rejection_reason now go through my_private_profile(), a
--      SECURITY DEFINER function scoped to auth.uid() — own-row by construction.
--
-- WHY NOT A VIEW OR A PII TABLE SPLIT
--   Both break PostgREST embedded joins (`campaigns?select=*,profiles:users(...)`)
--   which resolve against the base table, and would require rewriting 10 query
--   sites plus a data migration. Column grants close the exposure with no change
--   to RLS, no schema change, no data movement, and no join rewrites — the
--   smallest change that fully satisfies the requirement.
--
-- COMPATIBILITY
--   • RLS policies: UNCHANGED (users_select_all still returns all rows; grants
--     now decide which COLUMNS come back).
--   • UPDATE grants: UNCHANGED — `grant update (full_name, avatar_url, bio,
--     phone, preferred_language, updated_at)` still applies, so profile editing
--     (including editing your own phone) keeps working. Revoking SELECT does not
--     affect UPDATE.
--   • service_role / admin client: UNCHANGED — admin pages that read email keep
--     working (they use the service role, which is not affected by these grants).
--   • campaign_donors view: UNCHANGED — it is security_invoker = false, so it
--     reads users as its owner, not as the caller.
--   • `role` and `email_confirmed` stay readable: every admin gate
--     (`select('role')` in the admin layout and the admin API routes) depends on
--     them, and neither is in the sensitive set.
--
-- Run in: Supabase Dashboard -> SQL Editor. Idempotent. No data is modified.
-- ============================================================

-- ── 1. Column-level SELECT privileges ───────────────────────────────────────
-- Revoke ONLY select (update/insert grants are untouched).
revoke select on public.users from anon, authenticated;

-- Public-safe columns. Anything NOT listed here (email, phone,
-- rejection_reason) becomes unreadable to anon/authenticated.
-- All 17 users columns are enumerated below EXCEPT email / phone /
-- rejection_reason, so adding a future column is an explicit decision rather
-- than an accidental exposure.
grant select (
  id,
  full_name,
  avatar_url,
  username,
  username_changed_at,
  bio,
  verification_status,
  verified_at,
  donor_stats_public,
  preferred_language,
  role,
  email_confirmed,
  created_at,
  updated_at
) on public.users to anon, authenticated;

-- ── 2. Own-row access to the remaining private fields ───────────────────────
-- SECURITY DEFINER + `where id = auth.uid()` makes this own-row by construction:
-- a caller can never read anyone else's contact details or KYC rejection reason.
-- (email is returned for completeness; the app reads it from the auth session.)
create or replace function public.my_private_profile()
returns table (email text, phone text, rejection_reason text)
language sql
stable
security definer
set search_path = public
as $$
  select u.email, u.phone, u.rejection_reason
    from public.users u
   where u.id = auth.uid();
$$;

revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;

-- ============================================================
-- VERIFY (read-only):
--   -- sensitive columns must NOT be selectable by anon:
--   select column_name from information_schema.column_privileges
--    where table_schema='public' and table_name='users'
--      and grantee='anon' and privilege_type='SELECT'
--    order by column_name;
--   -- expect: no email / phone / rejection_reason in the list.
--
--   -- and as an anon PostgREST call, this must now fail:
--   --   GET /rest/v1/users?select=email     -> 42501 permission denied
--   -- while this must still succeed:
--   --   GET /rest/v1/campaigns?select=*,profiles:users(full_name,avatar_url)
-- ============================================================
