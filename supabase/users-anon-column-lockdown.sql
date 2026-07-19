-- ============================================================
-- XAYR — users anon column lockdown (migration #58, audit LOW: users table permissions)
-- ============================================================
-- CONTEXT
--   #53 (users-pii-hardening.sql) revoked the blanket SELECT on public.users and
--   re-granted 14 public-safe columns to BOTH anon and authenticated. Two of
--   those — `role` and `email_confirmed` — are only ever read for the CURRENT
--   user's own row (the client Navbar's admin link, /profile, the admin layout +
--   admin API routes) or by the service role (the admin users page + payment
--   notify helper). NO anonymous surface reads them, so granting them to anon let
--   an unauthenticated caller enumerate which accounts are admins.
--
-- FIX
--   Re-grant SELECT so anon gets the 12 truly-public columns and authenticated
--   additionally gets `role` + `email_confirmed`. Every authenticated own-row read
--   keeps working; anon simply can no longer read role / email_confirmed.
--   PostgREST embedded joins are unaffected — every embed selects only
--   full_name / avatar_url / bio / username (verified across app/components).
--
-- WHY THE GRANT SPLIT AND NOT AN RPC
--   `role` is read via a direct own-row PostgREST select in the CLIENT Navbar
--   (components/layout/Navbar.tsx) and in several server routes. Routing it
--   through a SECURITY DEFINER function would mean rewiring auth-critical client
--   and server paths for no protection beyond what removing the anon grant
--   already gives. The split keeps the change surgical and behaviour-preserving.
--
-- COMPATIBILITY
--   • service_role: UNCHANGED (bypasses grants) — admin pages that read role /
--     email / email_confirmed keep working.
--   • RLS policies: UNCHANGED (users_select_all still returns rows; grants decide
--     which COLUMNS come back).
--   • UPDATE / INSERT grants: UNCHANGED.
--
-- Idempotent. No schema or data change. Run AFTER #53.
-- Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================

revoke select on public.users from anon, authenticated;

-- Public to everyone (anon + authenticated): the 12 columns any visitor may see.
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
  created_at,
  updated_at
) on public.users to anon, authenticated;

-- Authenticated-only: `role` powers the Navbar admin link + every admin gate, and
-- `email_confirmed` the profile email badge — all own-row reads. Never to anon.
grant select (role, email_confirmed) on public.users to authenticated;

-- ============================================================
-- VERIFY (read-only):
--   select column_name from information_schema.column_privileges
--    where table_schema='public' and table_name='users'
--      and grantee='anon' and privilege_type='SELECT'
--    order by column_name;
--   -- expect: NO role / email_confirmed (and still no email / phone /
--   --         rejection_reason). authenticated still lists role + email_confirmed.
-- ============================================================
