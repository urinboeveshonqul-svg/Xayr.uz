-- ============================================================
-- XAYR — Withdrawal write-path repair (migration #62)
-- ============================================================
-- Brings the ENTIRE create_payout_request write path to its canonical state,
-- idempotently. Every step is a no-op if already correct, so it "fixes only what
-- is broken". Repairs the finite set of drift faults that make a withdrawal
-- INSERT fail inside the RPC:
--   • PGRST202 — 3-arg RPC missing from the PostgREST schema cache
--   • 23514    — financial_ledger entry_type CHECK missing 'withdrawal_requested'
--   • 42703    — financial_ledger.user_id / reference_id missing (used by the
--                AFTER-INSERT lifecycle trigger), or payout_requests missing
--                #26/#40 columns, or payout_accounts.card_number missing (#59)
--
-- SAFETY: never drops/rewrites data; never disables RLS; never removes a
-- withdrawal; only ADD COLUMN IF NOT EXISTS, re-assert CHECKs (validated against
-- existing rows, which already comply), and CREATE OR REPLACE functions/triggers.
-- Idempotent — safe to run repeatedly. Run in Supabase Dashboard -> SQL Editor.
-- Requires: payouts.sql(#18), payout-commission(#26), payout-info(#40),
-- financial-ledger(#45), financial-snapshots(#46).
-- ============================================================

-- ── 1. payout_requests: commission (#26) + snapshot (#40) columns ──
alter table public.payout_requests
  add column if not exists commission_amount integer not null default 0,
  add column if not exists payout_amount     integer,
  add column if not exists snap_card_type      text,
  add column if not exists snap_card_number     text,
  add column if not exists snap_cardholder_name text,
  add column if not exists snap_phone           text,
  add column if not exists snap_bank_name       text;

-- Backfill any legacy payout_amount nulls so the sum CHECK holds, then enforce.
update public.payout_requests
   set payout_amount = amount - coalesce(commission_amount, 0)
 where payout_amount is null;
alter table public.payout_requests alter column payout_amount set not null;

-- Re-assert the commission sum CHECK (#26). Existing rows already satisfy it.
alter table public.payout_requests drop constraint if exists payout_commission_sum;
alter table public.payout_requests add constraint payout_commission_sum
  check (commission_amount >= 0 and payout_amount >= 0
         and commission_amount + payout_amount = amount);

-- ── 2. payout_accounts.card_number (#59) ──
-- (No-op if already present. The table itself is created by #40.)
alter table public.payout_accounts
  add column if not exists card_number text;

-- ── 3. financial_ledger: #46 columns + widened entry_type CHECK ──
alter table public.financial_ledger
  add column if not exists user_id      uuid references public.users(id) on delete set null,
  add column if not exists reference_id text;

-- Superset of the #45 and #46 type sets — validates all existing rows.
alter table public.financial_ledger drop constraint if exists financial_ledger_entry_type_check;
alter table public.financial_ledger add constraint financial_ledger_entry_type_check
  check (entry_type in (
    'donation','refund','platform_fee','provider_fee','campaign_credit',
    'withdrawal','withdrawal_requested','withdrawal_approved','withdrawal_completed','withdrawal_cancelled',
    'adjustment','admin_correction','chargeback'
  ));

-- ── 4. Recreate the lifecycle trigger fn + trigger (#46), matching the schema ──
create or replace function public.ledger_on_payout_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'withdrawal_requested';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_type := case new.status
                when 'approved'  then 'withdrawal_approved'
                when 'cancelled' then 'withdrawal_cancelled'
                when 'rejected'  then 'withdrawal_cancelled'
                else null
              end;
  else
    v_type := null;
  end if;

  if v_type is not null then
    insert into public.financial_ledger
      (entry_type, amount, currency, campaign_id, payout_request_id, user_id, status,
       created_by, reference_id, source_key, metadata)
    values
      (v_type, 0, 'UZS', new.campaign_id, new.id, new.user_id, 'confirmed',
       new.reviewed_by, new.id::text, v_type || ':' || new.id,
       jsonb_build_object('payout_status', new.status))
    on conflict (source_key) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists trg_ledger_payout_lifecycle on public.payout_requests;
create trigger trg_ledger_payout_lifecycle after insert or update on public.payout_requests
  for each row execute function public.ledger_on_payout_lifecycle();

-- ── 5. Re-assert create_payout_request (3-arg, funded-allowed = #61) ──
-- Drops any stale 5-arg overload (pre-#40) so PostgREST resolves unambiguously.
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
  v_min        integer := 5000;   -- #60
  v_details    text;
  v_new_id     uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select user_id, status into v_owner, v_status
    from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_owner <> auth.uid() then raise exception 'not_campaign_owner'; end if;
  if v_status not in ('active','completed','funded') then raise exception 'campaign_not_approved'; end if;  -- #61

  if not exists (select 1 from public.users u
                  where u.id = auth.uid() and u.verification_status = 'verified') then
    raise exception 'owner_not_verified';
  end if;

  select * into v_acct from public.payout_accounts where user_id = auth.uid();
  if not found then raise exception 'payout_info_required'; end if;

  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_amount < v_min then raise exception 'below_minimum'; end if;

  if exists (select 1 from public.payout_requests
              where campaign_id = p_campaign_id
                and status in ('pending_review','approved','info_requested')) then
    raise exception 'active_request_exists';
  end if;

  v_available := public.campaign_available_balance(p_campaign_id);
  if p_amount > v_available then raise exception 'amount_exceeds_available'; end if;

  v_commission := round(p_amount * 0.04);   -- #51

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

-- ── 6. Force PostgREST to reload the schema cache (fixes PGRST202) ──
notify pgrst, 'reload schema';
