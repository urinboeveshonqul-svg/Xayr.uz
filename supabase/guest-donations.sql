-- ============================================================
-- XAYR — Guest donations: contact fields + name-display options
-- ============================================================
-- Lets a visitor donate without an account. The donation row now stores the
-- guest's name/email/phone (PII — admin/owner only via the existing donations
-- RLS) and a name_display preference ('full' | 'first' | 'anonymous'). The
-- public donor feed (campaign_donors view) renders the chosen display name for
-- BOTH guests and registered users, and never exposes email/phone.
--
-- Run in: Supabase Dashboard → SQL Editor (after schema.sql + campaign-donors-view.sql).
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Guest contact + display preference ───────────────────────────────────
alter table public.donations add column if not exists donor_name   text;
alter table public.donations add column if not exists donor_email  text;
alter table public.donations add column if not exists donor_phone  text;
alter table public.donations add column if not exists name_display text not null default 'full';

alter table public.donations drop constraint if exists donations_name_display_check;
alter table public.donations add constraint donations_name_display_check
  check (name_display in ('full','first','anonymous'));

-- Keep the legacy `anonymous` flag consistent for existing rows.
update public.donations set name_display = 'anonymous' where anonymous and name_display = 'full';

-- ── 2. Public donor feed: show the chosen display name (guest OR user) ──────
-- Never exposes email/phone. 'anonymous' → no name/avatar; 'first' → first word
-- of the name; 'full' → full name. Falls back to the guest's donor_name when
-- there is no linked user account.
create or replace view public.campaign_donors
  with (security_invoker = false) as
select
  d.id,
  d.campaign_id,
  d.amount,
  d.message,
  d.created_at,
  d.anonymous,
  case
    when d.anonymous or d.name_display = 'anonymous' then null
    when d.name_display = 'first'
      then nullif(split_part(coalesce(u.full_name, d.donor_name, ''), ' ', 1), '')
    else coalesce(u.full_name, d.donor_name)
  end as donor_name,
  case
    when d.anonymous or d.name_display = 'anonymous' then null
    else u.avatar_url
  end as donor_avatar
from public.donations d
left join public.users u on u.id = d.donor_id
where d.status = 'completed';

grant select on public.campaign_donors to anon, authenticated;

-- ============================================================
-- VERIFY:
--   -- a guest 'full' donation shows its donor_name in campaign_donors;
--   -- a 'first' donation shows only the first word; 'anonymous' shows null.
--   -- email/phone are never in the view.
-- ============================================================
