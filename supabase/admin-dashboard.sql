-- ============================================================
-- Admin dashboard: RBAC hardening + statistics view.
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================

-- ── 1. Prevent privilege escalation ─────────────────────────
-- The users_update_self policy lets a user update their own row, which (with
-- the default table-level UPDATE grant) included the `role` column — a user
-- could make themselves admin. Replace the table-level grant with column-level
-- grants that EXCLUDE role/id/email. Role changes now happen only via the
-- service role (the admin set-role API), after an admin check.
revoke update on public.users from anon, authenticated;
grant update (full_name, avatar_url, bio, phone, preferred_language, updated_at)
  on public.users to authenticated;

-- ── 2. Admin statistics (single-row view, service-role only) ─
create or replace view public.admin_stats
  with (security_invoker = false) as
select
  (select count(*) from public.users)::int                                                  as users_count,
  (select count(*) from public.campaigns)::int                                              as campaigns_count,
  (select count(*) from public.campaigns where status = 'active')::int                      as active_count,
  (select count(*) from public.campaigns where status = 'pending')::int                     as pending_count,
  (select count(*) from public.campaigns where status = 'completed')::int                   as completed_count,
  (select count(*) from public.donations)::int                                              as donations_count,
  (select coalesce(sum(amount), 0) from public.donations where status = 'completed')::bigint as total_raised;

-- Stats are read only by the service role (admin pages query them server-side).
revoke all on public.admin_stats from anon, authenticated;
grant select on public.admin_stats to service_role;
