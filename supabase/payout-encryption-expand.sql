-- ============================================================
-- XAYR — Payout instrument encryption, PHASE 1 / EXPAND (migration #56)
-- ============================================================
-- Adds the encrypted-payload columns alongside the existing plaintext ones and
-- teaches create_payout_request to snapshot BOTH. Nothing is removed, nothing is
-- backfilled, and no read path changes. After this migration the system is
-- dual-write / read-plaintext, which is fully reversible.
--
-- ENCRYPTION MODEL (application-layer, see lib/payout-crypto.ts)
--   Encryption happens in Node with AES-256-GCM before the value reaches
--   Postgres. The key lives ONLY in a server-side env var (PAYOUT_ENCRYPTION_KEY)
--   and NEVER in the database, so a dump / backup / replica / leaked service-role
--   key yields ciphertext only. This SQL therefore performs NO cryptography — it
--   only stores and byte-copies an opaque payload.
--
--   secret_enc   text  -- base64( iv(12) || authTag(16) || ciphertext )
--   secret_last4 text  -- non-sensitive, for masked display
--   key_version  int   -- which key encrypted this row (rotation support)
--
--   The plaintext inside the envelope is a JSON object, so future payout
--   instruments need no schema change:
--     card → {"card_number":"…"}     bank → {"iban":"…","account_number":"…"}
--
-- SCOPE GUARANTEE
--   The payout state machine, commission math, the #52 pay-time balance guard,
--   approval workflow, ledger, balances, donations and payments are UNCHANGED.
--   The only edit to create_payout_request is that it now also copies the three
--   new columns into the request snapshot (a byte copy — no crypto in SQL) and
--   prefers secret_last4 for the human-readable details line when present.
--
-- Run in: Supabase Dashboard -> SQL Editor (after #52). Idempotent.
-- ============================================================

-- ── 0. PRECONDITION GUARD ───────────────────────────────────────────────────
-- This file is order-dependent: the create_payout_request body below reads
-- v_acct.card_number, which #57 RENAMES to card_number_legacy_dropme. Because
-- plpgsql resolves identifiers at RUNTIME, re-running this file after #57 would
-- install successfully and then break EVERY withdrawal request. Every migration
-- here is documented "safe to re-run", so that is a realistic accident.
-- Fail loudly and immediately instead.
do $$
begin
  if to_regclass('public.payout_accounts') is null then
    raise exception
      'payout_accounts does not exist — apply #40 (payout-info.sql) before this migration.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payout_accounts'
                    and column_name='card_number')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payout_accounts'
                    and column_name='card_number_legacy_dropme') then
    raise exception
      'REFUSING TO RUN: #57 has already retired the plaintext column. Re-running #56 now would install a create_payout_request that reads the renamed card_number and break every withdrawal. If you need to re-assert the RPC, run #57 (payout-plaintext-retirement.sql) instead.';
  end if;
end $$;

-- ── 1. payout_accounts: encrypted payload alongside the plaintext column ────
alter table public.payout_accounts
  add column if not exists instrument_type text not null default 'card',
  add column if not exists secret_enc       text,
  add column if not exists secret_last4     text,
  add column if not exists key_version      integer;

-- Only 'card' exists today; the constraint documents the extension point.
alter table public.payout_accounts drop constraint if exists payout_accounts_instrument_type_check;
alter table public.payout_accounts add constraint payout_accounts_instrument_type_check
  check (instrument_type in ('card', 'bank'));

-- card_number stays NOT NULL in phase 1 (dual write). Phase 3 (#57) makes it
-- nullable and then drops it.

-- ── 2. payout_requests: mirror the snapshot columns ─────────────────────────
alter table public.payout_requests
  add column if not exists snap_instrument_type text,
  add column if not exists snap_secret_enc      text,
  add column if not exists snap_secret_last4    text,
  add column if not exists snap_key_version     integer;

-- ── 3. create_payout_request: snapshot BOTH plaintext and ciphertext ────────
-- Identical to #51/#52's version except for the snapshot columns and the
-- details line. Commission (4%), minimum, KYC gate, ownership check, active
-- request check, over-withdrawal guard and the event log are byte-for-byte
-- unchanged.
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
  v_min        integer := 50000;
  v_last4      text;
  v_details    text;
  v_new_id     uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select user_id, status into v_owner, v_status
    from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_owner <> auth.uid() then raise exception 'not_campaign_owner'; end if;
  if v_status not in ('active','completed') then raise exception 'campaign_not_approved'; end if;

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

  -- 4% platform commission (#51), computed server-side only.
  v_commission := round(p_amount * 0.04);

  -- Prefer the stored last4 (phase 2+); fall back to deriving it from the
  -- plaintext column while it still exists (phase 1).
  v_last4 := coalesce(v_acct.secret_last4, right(v_acct.card_number, 4));

  v_details := v_acct.full_legal_name
    || E'\n' || upper(v_acct.card_type) || ' •••• ' || coalesce(v_last4, '????')
    || E'\n' || v_acct.cardholder_name
    || E'\n' || v_acct.phone_number
    || coalesce(E'\n' || v_acct.bank_name, '');

  insert into public.payout_requests (
    campaign_id, user_id, amount, commission_amount, payout_amount,
    method, account_details, notes,
    snap_card_type, snap_card_number, snap_cardholder_name, snap_phone, snap_bank_name,
    -- NEW: encrypted snapshot (opaque byte copy — no crypto in SQL)
    snap_instrument_type, snap_secret_enc, snap_secret_last4, snap_key_version
  ) values (
    p_campaign_id, auth.uid(), p_amount, v_commission, p_amount - v_commission,
    'card', v_details, p_notes,
    v_acct.card_type, v_acct.card_number, v_acct.cardholder_name, v_acct.phone_number, v_acct.bank_name,
    coalesce(v_acct.instrument_type, 'card'), v_acct.secret_enc, v_acct.secret_last4, v_acct.key_version
  ) returning id into v_new_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (v_new_id, auth.uid(), 'created', null, 'pending_review', p_notes);

  return v_new_id;
end; $$;

grant execute on function public.create_payout_request(uuid, integer, text) to authenticated;

-- ============================================================
-- VERIFY (read-only):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='payout_accounts'
--      and column_name in ('instrument_type','secret_enc','secret_last4','key_version');
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='payout_requests'
--      and column_name like 'snap_secret%' or column_name='snap_key_version';
--   -- RPC must snapshot the new columns:
--   select pg_get_functiondef(p.oid) like '%snap_secret_enc%' as dual_snapshot
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='create_payout_request';
-- ============================================================
