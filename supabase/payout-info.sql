-- ============================================================
-- XAYR — Secure payout accounts + snapshot on withdrawals
-- ============================================================
-- Adds a dedicated, RLS-protected place for a creator's payout details and makes
-- each withdrawal request store a SNAPSHOT of those details, so history stays
-- accurate even after the creator edits their payout info later.
--
-- Reuses the EXISTING payout system (payout_requests, events, balance, commission,
-- admin state machine). Only adds what was missing.
--
-- NEVER stores CVV / PIN / expiry / passwords — only what a manual bank transfer
-- needs. Card number + PII are visible only to the owner and admins (RLS).
--
-- Depends on: schema.sql (users, set_updated_at, is_admin), payouts.sql,
--             payout-commission.sql. Run after those. Idempotent.
-- ============================================================

-- ── 1. payout_accounts (one per user) ───────────────────────
create table if not exists public.payout_accounts (
  user_id          uuid        primary key references public.users(id) on delete cascade,
  full_legal_name  text        not null,
  phone_number     text        not null,                       -- E.164: +998XXXXXXXXX
  card_type        text        not null check (card_type in ('uzcard','humo')),
  card_number      text        not null,                       -- 16 digits, no spaces (RLS-protected)
  cardholder_name  text        not null,
  bank_name        text,                                       -- optional
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;

-- Owner reads/writes only their own; admins may READ (for payout processing).
-- No public access, no delete policy.
drop policy if exists payout_accounts_select_own_admin on public.payout_accounts;
drop policy if exists payout_accounts_insert_own       on public.payout_accounts;
drop policy if exists payout_accounts_update_own       on public.payout_accounts;
create policy payout_accounts_select_own_admin on public.payout_accounts for select
  using (user_id = auth.uid() or public.is_admin());
create policy payout_accounts_insert_own on public.payout_accounts for insert
  with check (user_id = auth.uid());
create policy payout_accounts_update_own on public.payout_accounts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_payout_accounts_touch on public.payout_accounts;
create trigger trg_payout_accounts_touch before update on public.payout_accounts
  for each row execute function public.set_updated_at();

-- ── 2. Snapshot columns on payout_requests ──────────────────
-- Copied from the payout account at request time; never mutated afterwards, so a
-- request's history always shows the details used for THAT specific payout.
alter table public.payout_requests
  add column if not exists snap_card_type      text,
  add column if not exists snap_card_number     text,
  add column if not exists snap_cardholder_name text,
  add column if not exists snap_phone           text,
  add column if not exists snap_bank_name       text;

-- ── 3. create_payout_request: source + snapshot payout info, enforce minimum ──
-- New signature (campaign, amount, notes): the method/account come from the saved
-- payout account, not the client. Drops the old 5-arg signature.
drop function if exists public.create_payout_request(uuid, integer, text, text, text);

create or replace function public.create_payout_request(
  p_campaign_id uuid,
  p_amount      integer,
  p_notes       text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner      uuid;
  v_status     text;
  v_available  integer;
  v_commission integer;
  v_acct       public.payout_accounts%rowtype;
  -- CONFIGURABLE minimum withdrawal (so'm). Change here + re-run the migration.
  v_min        integer := 50000;
  v_details    text;
  v_new_id     uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  -- Lock the campaign row to serialize concurrent requests for the same campaign.
  select user_id, status into v_owner, v_status
    from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_owner <> auth.uid() then raise exception 'not_campaign_owner'; end if;
  if v_status not in ('active','completed') then raise exception 'campaign_not_approved'; end if;

  -- KYC required.
  if not exists (select 1 from public.users u
                  where u.id = auth.uid() and u.verification_status = 'verified') then
    raise exception 'owner_not_verified';
  end if;

  -- Payout information is required.
  select * into v_acct from public.payout_accounts where user_id = auth.uid();
  if not found then raise exception 'payout_info_required'; end if;

  -- Amount rules.
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_amount < v_min then raise exception 'below_minimum'; end if;

  -- One active request per campaign (also enforced by the unique index).
  if exists (select 1 from public.payout_requests
              where campaign_id = p_campaign_id
                and status in ('pending_review','approved','info_requested')) then
    raise exception 'active_request_exists';
  end if;

  -- Over-withdrawal guard.
  v_available := public.campaign_available_balance(p_campaign_id);
  if p_amount > v_available then raise exception 'amount_exceeds_available'; end if;

  -- 4% platform commission. Raised from 3% by #51 (payout-commission-4pct.sql);
  -- kept in sync here so a fresh install, or a re-run of this file, cannot
  -- silently revert the rate. #51 remains the migration that must be applied to
  -- databases where #40 already ran.
  v_commission := round(p_amount * 0.04);

  -- Human-readable details (kept for the legacy account_details column + display).
  v_details := v_acct.full_legal_name
    || E'\n' || upper(v_acct.card_type) || ' •••• ' || right(v_acct.card_number, 4)
    || E'\n' || v_acct.cardholder_name
    || E'\n' || v_acct.phone_number
    || coalesce(E'\n' || v_acct.bank_name, '');

  insert into public.payout_requests (
    campaign_id, user_id, amount, commission_amount, payout_amount,
    method, account_details, notes,
    snap_card_type, snap_card_number, snap_cardholder_name, snap_phone, snap_bank_name
  ) values (
    p_campaign_id, auth.uid(), p_amount, v_commission, p_amount - v_commission,
    'card', v_details, p_notes,
    v_acct.card_type, v_acct.card_number, v_acct.cardholder_name, v_acct.phone_number, v_acct.bank_name
  ) returning id into v_new_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (v_new_id, auth.uid(), 'created', null, 'pending_review', p_notes);

  return v_new_id;
end; $$;

grant execute on function public.create_payout_request(uuid, integer, text) to authenticated;

-- ── 4. mark_payout_paid: add an optional payment date ───────
drop function if exists public.mark_payout_paid(uuid, text);

create or replace function public.mark_payout_paid(
  p_request_id uuid,
  p_reference  text,
  p_paid_at    timestamptz default null
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
     set status = 'paid', payout_reference = p_reference, paid_at = coalesce(p_paid_at, now())
   where id = p_request_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (p_request_id, auth.uid(), 'paid', v_status, 'paid', p_reference);
end; $$;

grant execute on function public.mark_payout_paid(uuid, text, timestamptz) to authenticated;

-- ============================================================
-- NOTE: admin payout actions are already audited in payout_request_events
-- (created/approved/rejected/info_requested/paid). Card data on payout_accounts
-- and on the request snapshots is owner/admin-only via RLS — never public.
-- ============================================================
