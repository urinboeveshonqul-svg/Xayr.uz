-- ============================================================
-- XAYR — Platform withdrawal commission: 3% -> 4% (migration #51)
-- ============================================================
-- Raises the platform commission charged to CREATORS at withdrawal time from
-- 3% to 4%. Donors are unaffected: nothing in the donation flow reads this.
--
--   amount            = gross requested (deducted from the campaign balance)
--   commission_amount = round(amount * 4%)  -- platform revenue
--   payout_amount     = amount - commission -- what the creator receives
--
-- WHY A NEW MIGRATION INSTEAD OF EDITING #40:
-- Migrations are forward-only. Databases that already ran #40 (payout-info.sql)
-- hold the 3% function body, and re-running #40 is not something we can assume
-- will happen. This file is the authoritative rate change and must be applied to
-- every environment. #40's body is also updated to 4% so that a fresh install,
-- or a re-run of #40 during troubleshooting, cannot silently revert the rate.
--
-- BACKWARD COMPATIBILITY — DELIBERATE:
-- Existing payout_requests are NOT touched. Historical rows hold the rate that
-- was actually charged (0% before #26, 3% under #26..#50) and the CHECK
-- `commission_amount + payout_amount = amount` keeps them reconciled. Re-rating
-- them would misstate money that was already moved, and would break rows that
-- have already been paid out. Reads must always use the stored columns, never
-- re-derive a fee from today's rate.
--
-- Only the function body changes: no columns, no constraints, no data, no
-- triggers, no policies. The signature is unchanged, so nothing that calls
-- create_payout_request(uuid, integer, text) needs updating.
--
-- Run in: Supabase Dashboard -> SQL Editor (after payout-info.sql / #40).
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

  -- 4% platform commission (was 3% — see #51 header). Computed server-side ONLY:
  -- clients have no insert/update policy on payout_requests, so the fee cannot be
  -- bypassed or manipulated. Mirrored for DISPLAY by PLATFORM_FEE_RATE in
  -- lib/payout.ts — keep the two in sync.
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
-- VERIFY (read-only — the function body must show 0.04):
--   select pg_get_functiondef(p.oid) ilike '%0.04%' as is_four_percent
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_payout_request';
--
-- Historical rows keep their original rate — this must return a MIX of rates
-- (0 for pre-#26 rows, ~3% for #26..#50 rows, ~4% going forward), NOT all 4%:
--   select id, amount, commission_amount,
--          round(commission_amount::numeric / nullif(amount,0) * 100, 2) as pct
--     from public.payout_requests order by created_at desc limit 20;
-- ============================================================
