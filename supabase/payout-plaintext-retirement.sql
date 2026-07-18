-- ============================================================
-- XAYR — Payout plaintext RETIREMENT, PHASE 3A (migration #57)
-- ============================================================
-- Retires the plaintext card columns WITHOUT destroying them. This migration is
-- REVERSIBLE: the data is renamed aside, not dropped, so a rename-back fully
-- restores the previous state. The irreversible DROP is deliberately deferred to
-- migration #58 (phase 3B), after a production soak.
--
--   payout_accounts.card_number      -> card_number_legacy_dropme
--   payout_requests.snap_card_number -> snap_card_number_legacy_dropme
--
-- After this migration the ONLY runtime source of a payout card is the encrypted
-- payload (secret_enc / snap_secret_enc), decrypted exclusively in the audited
-- admin reveal endpoint with a server-only key. No application code reads or
-- writes the legacy columns — enforced here by revoking privileges, not just by
-- convention.
--
-- ⚠️ PRECONDITION — DO NOT APPLY UNTIL VERIFIED
--   supabase/verify-payout-encryption.sql must report
--   '✅ READY FOR PHASE 3' for BOTH tables, with remaining_plaintext = 0 and
--   zero rows from the integrity checks. This migration assumes every row has
--   been backfilled: once the plaintext is renamed away and the fallbacks are
--   removed, a row without secret_enc has no readable card at runtime.
--   That is recoverable (rename back + re-run the backfill) but it is a live
--   outage for payouts, so verify first.
--
-- SCOPE GUARANTEE
--   Payment processing, donations, balances, commissions, the ledger and the
--   payout workflow/state machine are untouched. create_payout_request changes
--   ONLY in that it no longer copies the plaintext column (which no longer
--   exists under that name) — the 4% commission, minimum, KYC gate, ownership
--   and active-request checks, the over-withdrawal guard and the event log are
--   byte-for-byte identical to #56.
--
-- Run in: Supabase Dashboard -> SQL Editor (after #56 + a verified backfill).
-- Idempotent.
-- ============================================================

-- ── 0. PRECONDITION GUARD ───────────────────────────────────────────────────
-- The rename below is guarded by `if exists(card_number)`, so this file would
-- otherwise SUCCEED even if #56 had never run — leaving a create_payout_request
-- that reads secret_last4 (a column #56 creates). plpgsql resolves identifiers
-- at RUNTIME, so the migration would report success and every withdrawal would
-- fail afterwards. Assert #56's columns exist first.
do $$
begin
  if to_regclass('public.payout_accounts') is null then
    raise exception
      'payout_accounts does not exist — apply #40 (payout-info.sql) first.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payout_accounts'
                    and column_name in ('secret_enc','secret_last4')
                  having count(*) = 2) then
    raise exception
      'REFUSING TO RUN: migration #56 (payout-encryption-expand.sql) has not been applied — payout_accounts.secret_enc / secret_last4 are missing. Retiring the plaintext now would leave no readable card at runtime. Apply #56, run the backfill, and confirm verify-payout-encryption.sql reports remaining_plaintext = 0 first.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payout_requests'
                    and column_name in ('snap_secret_enc','snap_secret_last4')
                  having count(*) = 2) then
    raise exception
      'REFUSING TO RUN: payout_requests snapshot columns from #56 are missing. Re-run payout-encryption-expand.sql.';
  end if;
end $$;

-- ── 1. Rename the plaintext columns aside ───────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='payout_accounts'
                and column_name='card_number') then
    alter table public.payout_accounts rename column card_number to card_number_legacy_dropme;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='payout_requests'
                and column_name='snap_card_number') then
    alter table public.payout_requests rename column snap_card_number to snap_card_number_legacy_dropme;
  end if;
end $$;

-- ── 2. Drop NOT NULL — nothing writes this column any more ──────────────────
-- Without this, every new payout_accounts insert would fail.
alter table public.payout_accounts alter column card_number_legacy_dropme drop not null;

-- ── 3. Mark deprecated (visible in the dashboard + \d output) ───────────────
comment on column public.payout_accounts.card_number_legacy_dropme is
  'DEPRECATED — retired plaintext PAN (migration #57). Kept ONLY as a temporary '
  'recovery mechanism during the phase-3 soak. No application code reads or '
  'writes it; the live value is the encrypted secret_enc payload. Scheduled for '
  'permanent removal in migration #58. Do not read this column from application '
  'code under any circumstance.';

comment on column public.payout_requests.snap_card_number_legacy_dropme is
  'DEPRECATED — retired plaintext PAN snapshot (migration #57). Kept ONLY as a '
  'temporary recovery mechanism during the phase-3 soak. The live value is '
  'snap_secret_enc. Scheduled for permanent removal in migration #58.';

-- ── 4. Prevent runtime access at the privilege layer ────────────────────────
-- Belt-and-braces: even if code were reintroduced that referenced these columns,
-- anon/authenticated cannot read them. service_role retains access purely so a
-- recovery rename-back is possible during the soak.
revoke all (card_number_legacy_dropme) on public.payout_accounts from anon, authenticated;
revoke all (snap_card_number_legacy_dropme) on public.payout_requests from anon, authenticated;

-- Also withhold the CIPHERTEXT from clients (defense in depth). It is
-- AES-256-GCM and useless without the server-only key, but nothing in the
-- browser needs it: the creator UI reads only secret_last4, and decryption
-- happens exclusively in the service-role admin reveal endpoint. Revoking it
-- means a stolen session cannot even exfiltrate the encrypted blobs.
--
-- ⚠️ Requires the matching app change: the withdraw page must select EXPLICIT
-- columns rather than select('*') on payout_requests, or PostgREST returns
-- "permission denied". That change ships in the same commit as this migration.
revoke all (secret_enc) on public.payout_accounts from anon, authenticated;
revoke all (snap_secret_enc) on public.payout_requests from anon, authenticated;

-- ── 5. create_payout_request: stop copying plaintext ────────────────────────
-- Identical to #56's version minus the plaintext snapshot. The last-4 now comes
-- solely from the stored secret_last4.
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

  v_details := v_acct.full_legal_name
    || E'\n' || upper(v_acct.card_type) || ' •••• ' || coalesce(v_acct.secret_last4, '????')
    || E'\n' || v_acct.cardholder_name
    || E'\n' || v_acct.phone_number
    || coalesce(E'\n' || v_acct.bank_name, '');

  insert into public.payout_requests (
    campaign_id, user_id, amount, commission_amount, payout_amount,
    method, account_details, notes,
    snap_card_type, snap_cardholder_name, snap_phone, snap_bank_name,
    snap_instrument_type, snap_secret_enc, snap_secret_last4, snap_key_version
  ) values (
    p_campaign_id, auth.uid(), p_amount, v_commission, p_amount - v_commission,
    'card', v_details, p_notes,
    v_acct.card_type, v_acct.cardholder_name, v_acct.phone_number, v_acct.bank_name,
    coalesce(v_acct.instrument_type, 'card'), v_acct.secret_enc, v_acct.secret_last4, v_acct.key_version
  ) returning id into v_new_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (v_new_id, auth.uid(), 'created', null, 'pending_review', p_notes);

  return v_new_id;
end; $$;

grant execute on function public.create_payout_request(uuid, integer, text) to authenticated;

-- ============================================================
-- VERIFY (read-only):
--   -- legacy columns exist, renamed, and are commented:
--   select column_name, col_description(
--            ('public.'||table_name)::regclass, ordinal_position) as note
--     from information_schema.columns
--    where table_schema='public'
--      and column_name in ('card_number_legacy_dropme','snap_card_number_legacy_dropme');
--
--   -- the old names are gone:
--   select count(*) as should_be_zero from information_schema.columns
--    where table_schema='public' and column_name in ('card_number','snap_card_number');
--
--   -- the RPC no longer references the plaintext snapshot:
--   select pg_get_functiondef(p.oid) not like '%snap_card_number%' as clean
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='create_payout_request';
--
-- ROLLBACK (phase 3A is reversible):
--   alter table public.payout_accounts rename column card_number_legacy_dropme to card_number;
--   alter table public.payout_requests rename column snap_card_number_legacy_dropme to snap_card_number;
--   -- then re-deploy the phase-2 build and re-run #56's create_payout_request.
-- ============================================================
