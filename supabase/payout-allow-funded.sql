-- ============================================================
-- XAYR — Allow withdrawals from FUNDED campaigns (migration #61)
-- ============================================================
-- ROOT-CAUSE FIX for "withdrawal request fails" on goal-reached campaigns.
--
-- The withdrawal UI offers the Withdraw action for `active` AND `funded`
-- campaigns (components/profile/MyCampaigns.tsx, and the withdraw page's own
-- `approved` gate allows active/completed/funded), but create_payout_request()
-- only accepted `('active','completed')` and raised `campaign_not_approved` for
-- `funded`. The `funded` status was introduced later by #41
-- (campaign-expiration.sql); the payout RPC (#40) predates it and was never
-- updated. Result: a creator whose campaign reached its goal (→ funded, via
-- close_campaign() or expire_due_campaigns()) fills the form, clicks Submit, and
-- the request is rejected even though the funds are there.
--
-- This migration recreates create_payout_request with the status guard widened
-- to `('active','completed','funded')`. EVERYTHING else is byte-for-byte
-- identical to #60 (withdrawal-minimum-5000.sql): same 3-arg signature, 4%
-- commission, v_min = 5000, all other guards, snapshots, event log. No columns,
-- constraints, data, triggers, or policies change.
--
-- Run in: Supabase Dashboard -> SQL Editor (after payout-info.sql / #40,
-- payout-commission-4pct.sql / #51, and withdrawal-minimum-5000.sql / #60).
-- Idempotent (create or replace).
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
  -- CONFIGURABLE minimum withdrawal (so'm). Kept 5000 (matches #60).
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
  -- Widened to include 'funded' (goal-reached campaigns are withdrawable) so the
  -- RPC matches what the UI offers. This is the only change vs #60.
  if v_status not in ('active','completed','funded') then raise exception 'campaign_not_approved'; end if;

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

  -- 4% platform commission (unchanged). Computed server-side ONLY.
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
-- VERIFY (read-only — the guard must include 'funded'):
--   select pg_get_functiondef(p.oid) ilike '%active%completed%funded%' as allows_funded
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_payout_request';
--   -- a withdrawal on a funded campaign now succeeds instead of raising
--   -- 'campaign_not_approved'.
-- ============================================================
