-- ============================================================
-- XAYR — Minimum withdrawal 50000 -> 5000 (migration #60)
-- ============================================================
-- Lowers the minimum withdrawal amount from 50,000 so'm to 5,000 so'm. The
-- maximum stays the campaign's available balance (already enforced by the
-- existing `amount_exceeds_available` guard — no hardcoded maximum).
--
-- ONLY `v_min` changes. The 4% commission, all guards (owner / KYC / payout-info
-- required / one-active-request / over-withdrawal), the snapshot columns, the
-- event log, and the signature are all IDENTICAL to #51 (payout-commission-4pct)
-- — this is a create-or-replace of the same function body with a single constant
-- changed. Fee/commission math and the withdrawal workflow are unaffected.
--
-- Mirrored for the client by MIN_WITHDRAWAL in lib/payout.ts — keep the two in
-- sync (the server is authoritative).
--
-- Run in: Supabase Dashboard -> SQL Editor (after payout-info.sql / #40 and
-- payout-commission-4pct.sql / #51). Idempotent (create or replace).
-- ============================================================

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
  -- CONFIGURABLE minimum withdrawal (so'm). Lowered 50000 -> 5000 by #60.
  v_min        integer := 5000;
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

  -- Over-withdrawal guard — the maximum is always the available balance.
  v_available := public.campaign_available_balance(p_campaign_id);
  if p_amount > v_available then raise exception 'amount_exceeds_available'; end if;

  -- 4% platform commission (unchanged). Computed server-side ONLY: clients have no
  -- insert/update policy on payout_requests, so the fee cannot be bypassed.
  -- Mirrored for DISPLAY by PLATFORM_FEE_RATE in lib/payout.ts.
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

-- ============================================================
-- VERIFY (read-only — the function body must show `v_min integer := 5000`):
--   select pg_get_functiondef(p.oid) ilike '%v_min%integer := 5000%' as min_is_5000
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_payout_request';
--   -- a 5,000 so'm request now succeeds; 4,999 still raises 'below_minimum'.
-- ============================================================
