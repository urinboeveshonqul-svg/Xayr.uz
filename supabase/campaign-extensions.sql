-- ============================================================
-- XAYR — Campaign extension workflow (Phase 2)
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
--     • no extension request already pending for the campaign
--
--   Like payouts, ALL writes go through SECURITY DEFINER functions — there are
--   no client insert/update policies, so status can't be forged. Owners only
--   READ their own requests; admins read all and act via approve/reject.
--
-- Depends on: campaigns, users, is_admin(), set_updated_at(),
--             secure-campaign-fields-rls.sql (guard bypass), campaign-expiration.sql.
-- Run in: Supabase Dashboard → SQL Editor (after campaign-expiration.sql).
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 0. Per-campaign extension counter ───────────────────────────────────────
alter table public.campaigns add column if not exists extension_count integer not null default 0;

-- ── 1. Requests table ───────────────────────────────────────────────────────
create table if not exists public.campaign_extension_requests (
  id                 uuid        primary key default gen_random_uuid(),
  campaign_id        uuid        not null references public.campaigns(id) on delete cascade,
  user_id            uuid        not null references public.users(id)     on delete cascade,
  requested_deadline timestamptz not null,
  previous_deadline  timestamptz,
  status             text        not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  admin_note         text,
  reviewed_by        uuid        references public.users(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

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

-- ── 3. Owner requests an extension ──────────────────────────────────────────
create or replace function public.request_campaign_extension(
  p_campaign_id  uuid,
  p_new_deadline timestamptz
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

  insert into public.campaign_extension_requests
    (campaign_id, user_id, requested_deadline, previous_deadline)
  values (p_campaign_id, auth.uid(), p_new_deadline, v_old_dl)
  returning id into v_new_id;

  return v_new_id;
end; $$;

-- ── 4. Admin approves → reactivate the campaign + notify owner ───────────────
create or replace function public.approve_campaign_extension(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_campaign uuid;
  v_deadline timestamptz;
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

  -- Reactivate with the new deadline. The field guard is satisfied by is_admin()
  -- here; the bypass flag is belt-and-suspenders in case of a service-role call.
  perform set_config('app.guard_campaign_bypass', 'on', true);
  update public.campaigns
     set status = 'active', deadline = v_deadline, extension_count = extension_count + 1
   where id = v_campaign;
  perform set_config('app.guard_campaign_bypass', 'off', true);

  insert into public.notifications (user_id, type, title, body, link)
  select c.user_id, 'campaign_status', 'Muddat uzaytirildi',
         'Kampaniyangiz muddati uzaytirildi va qayta faollashtirildi: ' || c.title,
         '/campaigns/' || c.slug
    from public.campaigns c where c.id = v_campaign;
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

-- ── 6. Grants (functions enforce owner/admin internally) ────────────────────
grant execute on function public.request_campaign_extension(uuid, timestamptz) to authenticated;
grant execute on function public.approve_campaign_extension(uuid)              to authenticated;
grant execute on function public.reject_campaign_extension(uuid, text)         to authenticated;

-- ============================================================
-- VERIFY:
--   -- as the verified owner of an expired, under-goal campaign:
--   select public.request_campaign_extension('<id>', now() + interval '14 days');
--   -- as an admin:
--   select public.approve_campaign_extension('<request-id>');
--   select status, deadline, extension_count from public.campaigns where id='<id>';
-- ============================================================
