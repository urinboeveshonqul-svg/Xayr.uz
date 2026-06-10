-- ============================================================
-- XAYR — Withdrawal / Payout flow (Phase 1: secure data layer)
--
-- Payouts are RECORDS + an admin-gated state machine. No money moves in-app;
-- disbursement happens off-platform and the admin records the external
-- reference at PAID. All writes go through SECURITY DEFINER functions; there
-- are NO client insert/update policies (same hardening as donations), so
-- status can never be forged and every change is audited.
--
-- Depends on: campaigns, users, is_admin(), set_updated_at(),
--             secure-donations-rls.sql (so current_amount is tamper-proof).
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

-- ── 1. Tables ───────────────────────────────────────────────
create table if not exists public.payout_requests (
  id               uuid        primary key default gen_random_uuid(),
  campaign_id      uuid        not null references public.campaigns(id) on delete cascade,
  user_id          uuid        not null references public.users(id)     on delete cascade,
  amount           integer     not null check (amount > 0),
  method           text        not null check (method in ('bank','card')),
  account_details  text        not null,                     -- PII: owner/admin reads only
  notes            text,
  status           text        not null default 'pending_review'
                     check (status in ('pending_review','approved','info_requested','rejected','paid','cancelled')),
  reviewed_by      uuid        references public.users(id) on delete set null,
  admin_note       text,
  payout_reference text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  paid_at          timestamptz
);

create table if not exists public.payout_request_events (
  id          uuid        primary key default gen_random_uuid(),
  request_id  uuid        not null references public.payout_requests(id) on delete cascade,
  actor_id    uuid        references public.users(id) on delete set null,
  action      text        not null check (action in ('created','approved','rejected','info_requested','paid','cancelled')),
  from_status text,
  to_status   text        not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── 2. Indexes ──────────────────────────────────────────────
create index if not exists idx_payout_campaign       on public.payout_requests (campaign_id);
create index if not exists idx_payout_user           on public.payout_requests (user_id);
create index if not exists idx_payout_status         on public.payout_requests (status, created_at desc);
create index if not exists idx_payout_events_request on public.payout_request_events (request_id, created_at);

-- One ACTIVE request per campaign (prevents double-withdrawal at the DB layer).
create unique index if not exists uniq_active_payout_per_campaign
  on public.payout_requests (campaign_id)
  where status in ('pending_review','approved','info_requested');

-- keep updated_at fresh
drop trigger if exists trg_payout_requests_touch on public.payout_requests;
create trigger trg_payout_requests_touch before update on public.payout_requests
  for each row execute function public.set_updated_at();

-- ── 3. RLS (read-only for clients; all writes via SECURITY DEFINER fns) ──
alter table public.payout_requests       enable row level security;
alter table public.payout_request_events enable row level security;

drop policy if exists payouts_select_own_or_admin on public.payout_requests;
create policy payouts_select_own_or_admin on public.payout_requests for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists payout_events_select on public.payout_request_events;
create policy payout_events_select on public.payout_request_events for select
  using (
    public.is_admin()
    or exists (select 1 from public.payout_requests r
                where r.id = request_id and r.user_id = auth.uid())
  );
-- (Intentionally NO insert/update/delete policies — service-definer functions only.)

-- ── 4. Available balance ────────────────────────────────────
-- Raised (completed donations, tamper-proof) minus funds already committed to
-- active or paid payout requests. Never negative.
create or replace function public.campaign_available_balance(p_campaign_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select greatest(
    0,
    coalesce((select current_amount from public.campaigns where id = p_campaign_id), 0)
    - coalesce((
        select sum(amount) from public.payout_requests
         where campaign_id = p_campaign_id
           and status in ('pending_review','approved','info_requested','paid')
      ), 0)
  );
$$;

-- ── 5. State-machine functions ──────────────────────────────
-- 5.1 create (verified owner of an approved campaign) -> pending_review
create or replace function public.create_payout_request(
  p_campaign_id     uuid,
  p_amount          integer,
  p_method          text,
  p_account_details text,
  p_notes           text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner     uuid;
  v_status    text;
  v_available integer;
  v_new_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  -- Lock the campaign row to serialize concurrent requests for the same campaign.
  select user_id, status into v_owner, v_status
    from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'not_campaign_owner';
  end if;
  if v_status not in ('active','completed') then
    raise exception 'campaign_not_approved';
  end if;
  if not exists (select 1 from public.users u
                  where u.id = auth.uid() and u.verification_status = 'verified') then
    raise exception 'owner_not_verified';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if p_method not in ('bank','card') then
    raise exception 'invalid_method';
  end if;
  if coalesce(btrim(p_account_details), '') = '' then
    raise exception 'account_details_required';
  end if;

  -- One active request per campaign (also enforced by the unique index).
  if exists (select 1 from public.payout_requests
              where campaign_id = p_campaign_id
                and status in ('pending_review','approved','info_requested')) then
    raise exception 'active_request_exists';
  end if;

  -- Over-withdrawal guard.
  v_available := public.campaign_available_balance(p_campaign_id);
  if p_amount > v_available then
    raise exception 'amount_exceeds_available';
  end if;

  insert into public.payout_requests (campaign_id, user_id, amount, method, account_details, notes)
  values (p_campaign_id, auth.uid(), p_amount, p_method, p_account_details, p_notes)
  returning id into v_new_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (v_new_id, auth.uid(), 'created', null, 'pending_review', p_notes);

  return v_new_id;
end; $$;

-- 5.2 approve (admin): pending_review | info_requested -> approved
create or replace function public.approve_payout_request(
  p_request_id uuid,
  p_note       text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  select status into v_status from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status not in ('pending_review','info_requested') then raise exception 'invalid_transition'; end if;

  update public.payout_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         admin_note = coalesce(p_note, admin_note)
   where id = p_request_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (p_request_id, auth.uid(), 'approved', v_status, 'approved', p_note);
end; $$;

-- 5.3 reject (admin): pending_review | info_requested -> rejected (reason required)
create or replace function public.reject_payout_request(
  p_request_id uuid,
  p_note       text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select status into v_status from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status not in ('pending_review','info_requested') then raise exception 'invalid_transition'; end if;

  update public.payout_requests
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), admin_note = p_note
   where id = p_request_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (p_request_id, auth.uid(), 'rejected', v_status, 'rejected', p_note);
end; $$;

-- 5.4 request more info (admin): pending_review -> info_requested (note required)
create or replace function public.request_payout_info(
  p_request_id uuid,
  p_note       text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'note_required'; end if;
  select status into v_status from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status <> 'pending_review' then raise exception 'invalid_transition'; end if;

  update public.payout_requests
     set status = 'info_requested', reviewed_by = auth.uid(), admin_note = p_note
   where id = p_request_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (p_request_id, auth.uid(), 'info_requested', v_status, 'info_requested', p_note);
end; $$;

-- 5.5 mark paid (admin): approved -> paid (external reference required)
create or replace function public.mark_payout_paid(
  p_request_id uuid,
  p_reference  text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'reference_required'; end if;
  select status into v_status from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status <> 'approved' then raise exception 'invalid_transition'; end if;

  update public.payout_requests
     set status = 'paid', payout_reference = p_reference, paid_at = now()
   where id = p_request_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (p_request_id, auth.uid(), 'paid', v_status, 'paid', p_reference);
end; $$;

-- ── 6. Grants (functions enforce owner/admin internally) ────
grant execute on function public.campaign_available_balance(uuid)                      to authenticated;
grant execute on function public.create_payout_request(uuid, integer, text, text, text) to authenticated;
grant execute on function public.approve_payout_request(uuid, text)                    to authenticated;
grant execute on function public.reject_payout_request(uuid, text)                     to authenticated;
grant execute on function public.request_payout_info(uuid, text)                       to authenticated;
grant execute on function public.mark_payout_paid(uuid, text)                          to authenticated;
