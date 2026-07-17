-- ============================================================
-- XAYR — platform commission on withdrawals (columns + integrity)
-- The fee is charged to CREATORS at withdrawal time only (donors pay nothing).
--   amount            = gross requested (deducted from campaign balance)
--   commission_amount = round(amount * rate)  — platform revenue
--   payout_amount     = amount - commission   — what the creator receives
--
-- ⚠️ RATE: this file's 5-arg create_payout_request is DEAD — #40
-- (payout-info.sql) drops that signature and replaces it with the 3-arg version.
-- The live rate is 4%, set by #51 (payout-commission-4pct.sql). The body below
-- is kept at the same rate only so a stray re-run of this file cannot resurrect
-- a 3% code path. This migration's real contribution is the columns + the
-- `payout_commission_sum` CHECK, which are rate-independent.
-- Computed ONLY inside create_payout_request() (SECURITY DEFINER); clients have
-- no insert/update policies on payout_requests, so the fee cannot be bypassed
-- or manipulated. Existing rows are backfilled fee-free (backwards compatible).
-- Run in: Supabase Dashboard -> SQL Editor (after payouts.sql). Safe to re-run.
-- ============================================================

-- ── 1. Columns + backfill ───────────────────────────────────
alter table public.payout_requests
  add column if not exists commission_amount integer not null default 0,
  add column if not exists payout_amount     integer;

-- Legacy rows (created before the fee existed): no commission, full payout.
update public.payout_requests
   set payout_amount = amount
 where payout_amount is null;

alter table public.payout_requests
  alter column payout_amount set not null;

-- Integrity: the split must always reconcile and never go negative.
alter table public.payout_requests drop constraint if exists payout_commission_sum;
alter table public.payout_requests add constraint payout_commission_sum
  check (commission_amount >= 0 and payout_amount >= 0
         and commission_amount + payout_amount = amount);

-- ── 2. Recreate create_payout_request with server-side fee math ──
create or replace function public.create_payout_request(
  p_campaign_id     uuid,
  p_amount          integer,
  p_method          text,
  p_account_details text,
  p_notes           text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner      uuid;
  v_status     text;
  v_available  integer;
  v_commission integer;
  v_new_id     uuid;
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

  -- Over-withdrawal guard (gross amount counts against the balance).
  v_available := public.campaign_available_balance(p_campaign_id);
  if p_amount > v_available then
    raise exception 'amount_exceeds_available';
  end if;

  -- 4% platform commission, computed server-side only (see #51).
  v_commission := round(p_amount * 0.04)::integer;

  insert into public.payout_requests
    (campaign_id, user_id, amount, method, account_details, notes,
     commission_amount, payout_amount)
  values
    (p_campaign_id, auth.uid(), p_amount, p_method, p_account_details, p_notes,
     v_commission, p_amount - v_commission)
  returning id into v_new_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (v_new_id, auth.uid(), 'created', null, 'pending_review', p_notes);

  return v_new_id;
end; $$;

grant execute on function public.create_payout_request(uuid, integer, text, text, text) to authenticated;
