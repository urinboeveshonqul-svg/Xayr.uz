-- ============================================================
-- XAYR — Donor profile statistics
-- Stats are AGGREGATED from the existing donations table (no duplicated data).
-- Privacy: users.donor_stats_public (default private). get_donor_stats() is the
-- single read path — it returns real aggregates only to the donor themselves,
-- admins, or anyone when the donor opted into public; otherwise it returns
-- zeros (indistinguishable from "no donations", so nothing leaks). Raw donation
-- rows stay protected by the existing donations_select_scoped RLS regardless.
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================

alter table public.users
  add column if not exists donor_stats_public boolean not null default false;

create or replace function public.get_donor_stats(p_user_id uuid)
returns table (
  donations_count integer,
  total_amount    bigint,
  campaigns_count integer,
  first_donation  timestamptz
)
language sql stable security definer set search_path = public as $$
  select count(*)::int,
         coalesce(sum(amount), 0)::bigint,
         count(distinct campaign_id)::int,
         min(created_at)
    from public.donations
   where donor_id = p_user_id
     and status = 'completed'
     and (
       p_user_id = auth.uid()
       or public.is_admin()
       or exists (select 1 from public.users u
                   where u.id = p_user_id and u.donor_stats_public = true)
     );
$$;

grant execute on function public.get_donor_stats(uuid) to anon, authenticated;
