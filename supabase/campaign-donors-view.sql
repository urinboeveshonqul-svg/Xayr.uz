-- ============================================================
-- Public, privacy-safe donor feed for campaign detail pages.
--
-- The `donations` table RLS restricts row reads to the donor / campaign
-- owner / admin. This view (security definer — runs as its owner, so it
-- bypasses that RLS) exposes ONLY safe columns for COMPLETED donations,
-- and masks the name/avatar of anonymous donors.
--
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================
create or replace view public.campaign_donors
  with (security_invoker = false) as
select
  d.id,
  d.campaign_id,
  d.amount,
  d.message,
  d.created_at,
  d.anonymous,
  case when d.anonymous then null else u.full_name  end as donor_name,
  case when d.anonymous then null else u.avatar_url end as donor_avatar
from public.donations d
left join public.users u on u.id = d.donor_id
where d.status = 'completed';

grant select on public.campaign_donors to anon, authenticated;
