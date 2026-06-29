-- ============================================================
-- XAYR — Campaign extension: reason, timeline, donor notify, manual close
-- ============================================================
-- Builds on campaign-extensions.sql (#42). Adds:
--   • a REQUIRED reason (+ category) on every extension request
--   • campaigns.original_deadline (captured on the first extension) for analytics
--   • DONOR notifications when an extension is approved (fundraising resumed)
--   • close_campaign() — owner manually closes a goal-reached active campaign → funded
--   • get_campaign_extension_history() — public-safe timeline (dates only, no reason)
--
-- Run in: Supabase Dashboard → SQL Editor (after campaign-extensions.sql).
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Reason on the request + original deadline on the campaign ─────────────
alter table public.campaign_extension_requests
  add column if not exists reason          text,
  add column if not exists reason_category text;

alter table public.campaign_extension_requests
  drop constraint if exists cext_reason_category_check;
alter table public.campaign_extension_requests
  add constraint cext_reason_category_check
  check (reason_category is null or reason_category in ('treatment','construction','emergency','other'));

alter table public.campaigns
  add column if not exists original_deadline timestamptz;

-- ── 2. Owner requests an extension (now requires a reason) ───────────────────
-- The signature changed (added p_reason, p_reason_category), so drop the old one.
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

-- ── 3. Admin approves → reactivate + capture original deadline + notify all ──
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

-- ── 4. Owner manually closes a goal-reached active campaign → funded ─────────
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

-- ── 5. Public-safe extension timeline (dates only — never the reason) ────────
create or replace function public.get_campaign_extension_history(p_campaign_id uuid)
returns table (approved_at timestamptz, previous_deadline timestamptz, new_deadline timestamptz)
language sql stable security definer set search_path = public as $$
  select reviewed_at, previous_deadline, requested_deadline
    from public.campaign_extension_requests
   where campaign_id = p_campaign_id and status = 'approved'
   order by reviewed_at asc nulls last;
$$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
grant execute on function public.request_campaign_extension(uuid, timestamptz, text, text) to authenticated;
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
