-- ============================================================
-- XAYR — Campaign extension workflow (table + reason + timeline + manual close)
-- ============================================================
-- Lets the owner of an EXPIRED, under-goal campaign ask an admin to extend the
-- deadline. Approval reactivates the campaign ('active' again), so it returns to
-- the homepage / search / categories / featured rotation and can take donations.
--
--   Rules (enforced server-side in request_campaign_extension):
--     • caller is the campaign owner
--     • owner is KYC-verified (verification_status = 'verified')
--     • campaign.status = 'expired'
--     • goal NOT reached (current_amount < goal_amount)
--     • extension_count < c_max_count          (configurable, default 2)
--     • new deadline is in the future and ≤ c_max_days from now (default 30)
--     • a reason is required; no extension request already pending
--
--   Like payouts, ALL writes go through SECURITY DEFINER functions — there are
--   no client insert/update policies, so status can't be forged. Owners only
--   READ their own requests; admins read all and act via approve/reject.
--
-- THIS FILE IS SELF-CONTAINED. It creates the table AND every column/function the
-- feature needs (reason, original_deadline, donor notify, manual close, public
-- timeline). It used to be split into campaign-extensions.sql + an alphabetically
-- EARLIER campaign-extension-details.sql, which made a folder-order run apply the
-- ALTERs before the CREATE (ERROR 42P01). Merged so the chain can't break.
--
-- Depends on: campaigns, users, donations, is_admin(), set_updated_at(),
--             secure-campaign-fields-rls.sql (guard bypass), campaign-expiration.sql.
-- Run in: Supabase Dashboard → SQL Editor (after campaign-expiration.sql).
-- Idempotent — safe to re-run, and safe on a DB created by an earlier version.
-- ============================================================

-- ── 0. Campaign counters / original deadline ────────────────────────────────
alter table public.campaigns add column if not exists extension_count   integer not null default 0;
alter table public.campaigns add column if not exists original_deadline timestamptz;

-- ── 1. Requests table (fresh installs get the full shape) ───────────────────
create table if not exists public.campaign_extension_requests (
  id                 uuid        primary key default gen_random_uuid(),
  campaign_id        uuid        not null references public.campaigns(id) on delete cascade,
  user_id            uuid        not null references public.users(id)     on delete cascade,
  requested_deadline timestamptz not null,
  previous_deadline  timestamptz,
  reason             text,
  reason_category    text,
  status             text        not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  admin_note         text,
  reviewed_by        uuid        references public.users(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Upgrade path: a DB whose table predates the reason columns gets them now.
alter table public.campaign_extension_requests add column if not exists reason          text;
alter table public.campaign_extension_requests add column if not exists reason_category text;

alter table public.campaign_extension_requests drop constraint if exists cext_reason_category_check;
alter table public.campaign_extension_requests add constraint cext_reason_category_check
  check (reason_category is null or reason_category in ('treatment','construction','emergency','other'));

create index if not exists idx_cext_campaign on public.campaign_extension_requests (campaign_id);
create index if not exists idx_cext_status   on public.campaign_extension_requests (status, created_at desc);
-- At most one OPEN request per campaign (also re-checked in the RPC).
create unique index if not exists uniq_pending_extension_per_campaign
  on public.campaign_extension_requests (campaign_id) where status = 'pending';

drop trigger if exists trg_cext_touch on public.campaign_extension_requests;
create trigger trg_cext_touch before update on public.campaign_extension_requests
  for each row execute function public.set_updated_at();

-- ── 2. RLS (read own/admin; writes via SECURITY DEFINER fns only) ────────────
alter table public.campaign_extension_requests enable row level security;
drop policy if exists cext_select_own_or_admin on public.campaign_extension_requests;
create policy cext_select_own_or_admin on public.campaign_extension_requests for select
  using (user_id = auth.uid() or public.is_admin());
-- (Intentionally NO insert/update/delete policies — definer functions only.)

-- ── 3. Owner requests an extension (reason required) ────────────────────────
-- Drop the older 2-arg signature if a previous version of this migration created it.
drop function if exists public.request_campaign_extension(uuid, timestamptz);

create or replace function public.request_campaign_extension(
  p_campaign_id     uuid,
  p_new_deadline    timestamptz,
  p_reason          text,
  p_reason_category text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c_max_days  constant integer := 30;  -- CONFIG: max extension length (days from now)
  c_max_count constant integer := 2;   -- CONFIG: max extensions per campaign
  v_owner   uuid;
  v_status  text;
  v_goal    numeric;
  v_raised  numeric;
  v_count   integer;
  v_old_dl  timestamptz;
  v_new_id  uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select user_id, status, goal_amount, current_amount, deadline, extension_count
    into v_owner, v_status, v_goal, v_raised, v_old_dl, v_count
    from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_owner <> auth.uid() then raise exception 'not_campaign_owner'; end if;
  if not exists (select 1 from public.users u
                  where u.id = auth.uid() and u.verification_status = 'verified') then
    raise exception 'owner_not_verified';
  end if;
  if v_status <> 'expired' then raise exception 'not_expired'; end if;
  if v_goal > 0 and v_raised >= v_goal then raise exception 'goal_reached'; end if;
  if coalesce(v_count, 0) >= c_max_count then raise exception 'max_extensions'; end if;
  if exists (select 1 from public.campaign_extension_requests
              where campaign_id = p_campaign_id and status = 'pending') then
    raise exception 'pending_exists';
  end if;
  if p_new_deadline is null or p_new_deadline <= now() then raise exception 'invalid_deadline'; end if;
  if p_new_deadline > now() + (c_max_days || ' days')::interval then raise exception 'deadline_too_far'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  insert into public.campaign_extension_requests
    (campaign_id, user_id, requested_deadline, previous_deadline, reason, reason_category)
  values (p_campaign_id, auth.uid(), p_new_deadline, v_old_dl, btrim(p_reason),
          nullif(p_reason_category, ''))
  returning id into v_new_id;

  return v_new_id;
end; $$;

-- ── 4. Admin approves → reactivate + capture original deadline + notify all ──
create or replace function public.approve_campaign_extension(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_campaign uuid;
  v_deadline timestamptz;
  v_owner    uuid;
  v_title    text;
  v_slug     text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  select status, campaign_id, requested_deadline
    into v_status, v_campaign, v_deadline
    from public.campaign_extension_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status <> 'pending' then raise exception 'invalid_transition'; end if;

  update public.campaign_extension_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id;

  -- Reactivate. original_deadline is captured the first time only (coalesce uses
  -- the pre-update deadline). Field guard satisfied by is_admin(); flag is backup.
  perform set_config('app.guard_campaign_bypass', 'on', true);
  update public.campaigns
     set status            = 'active',
         original_deadline = coalesce(original_deadline, deadline),
         deadline          = v_deadline,
         extension_count   = extension_count + 1
   where id = v_campaign
  returning user_id, title, slug into v_owner, v_title, v_slug;
  perform set_config('app.guard_campaign_bypass', 'off', true);

  -- Owner copy.
  insert into public.notifications (user_id, type, title, body, link)
  values (v_owner, 'campaign_status', 'Muddat uzaytirildi',
          'Kampaniyangiz muddati uzaytirildi va qayta faollashtirildi: ' || v_title,
          '/campaigns/' || v_slug);

  -- Previous donors: fundraising resumed. type 'update' → push category
  -- campaign_updates, which donors can disable in notification settings.
  insert into public.notifications (user_id, type, title, body, link)
  select distinct d.donor_id, 'update', 'Kampaniya qayta faollashtirildi',
         'Siz qo''llab-quvvatlagan kampaniya muddati uzaytirildi va xayriyalar qayta ochildi: ' || v_title,
         '/campaigns/' || v_slug
    from public.donations d
   where d.campaign_id = v_campaign
     and d.status = 'completed'
     and d.donor_id is not null
     and d.donor_id <> v_owner;
end; $$;

-- ── 5. Admin rejects → keep expired + notify owner with the reason ──────────
create or replace function public.reject_campaign_extension(p_request_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_campaign uuid;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select status, campaign_id into v_status, v_campaign
    from public.campaign_extension_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status <> 'pending' then raise exception 'invalid_transition'; end if;

  update public.campaign_extension_requests
     set status = 'rejected', admin_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, link)
  select c.user_id, 'campaign_status', 'Muddatni uzaytirish rad etildi',
         'Kampaniya muddatini uzaytirish so''rovingiz rad etildi: ' || c.title || '. Sabab: ' || p_note,
         '/profile/campaigns'
    from public.campaigns c where c.id = v_campaign;
end; $$;

-- ── 6. Owner manually closes a goal-reached active campaign → funded ─────────
create or replace function public.close_campaign(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_status text;
  v_goal   numeric;
  v_raised numeric;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select user_id, status, goal_amount, current_amount
    into v_owner, v_status, v_goal, v_raised
    from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_owner <> auth.uid() then raise exception 'not_campaign_owner'; end if;
  if v_status <> 'active' then raise exception 'not_active'; end if;
  if not (v_goal > 0 and v_raised >= v_goal) then raise exception 'goal_not_reached'; end if;

  -- → 'funded'; the campaign-status trigger sends the owner notification.
  perform set_config('app.guard_campaign_bypass', 'on', true);
  update public.campaigns set status = 'funded' where id = p_campaign_id;
  perform set_config('app.guard_campaign_bypass', 'off', true);
end; $$;

-- ── 7. Public-safe extension timeline (dates only — never the reason) ────────
create or replace function public.get_campaign_extension_history(p_campaign_id uuid)
returns table (approved_at timestamptz, previous_deadline timestamptz, new_deadline timestamptz)
language sql stable security definer set search_path = public as $$
  select reviewed_at, previous_deadline, requested_deadline
    from public.campaign_extension_requests
   where campaign_id = p_campaign_id and status = 'approved'
   order by reviewed_at asc nulls last;
$$;

-- ── 8. Grants (functions enforce owner/admin internally) ────────────────────
grant execute on function public.request_campaign_extension(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.approve_campaign_extension(uuid)                           to authenticated;
grant execute on function public.reject_campaign_extension(uuid, text)                      to authenticated;
grant execute on function public.close_campaign(uuid)                                       to authenticated;
grant execute on function public.get_campaign_extension_history(uuid)                       to anon, authenticated;

-- ============================================================
-- VERIFY:
--   select public.request_campaign_extension('<id>', now()+interval '10 days',
--          'Treatment needs more time', 'treatment');
--   select public.approve_campaign_extension('<request-id>');
--   select * from public.get_campaign_extension_history('<id>');
--   select original_deadline, extension_count from public.campaigns where id='<id>';
-- ============================================================
