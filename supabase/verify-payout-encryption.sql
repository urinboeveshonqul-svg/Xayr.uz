-- ============================================================
-- XAYR — Payout encryption verification (READ-ONLY)
-- ============================================================
-- Run in: Supabase Dashboard -> SQL Editor. Changes nothing — it only counts.
--
-- SCHEMA-STATE TOLERANT. The plaintext column is named differently depending on
-- how far the rollout has progressed, so referencing it statically would make
-- this script fail with a cryptic "column does not exist" on one side of the
-- migration it is supposed to gate:
--
--   after #56, before #57 : payout_accounts.card_number
--   after #57             : payout_accounts.card_number_legacy_dropme
--   after #58 (phase 3B)  : neither (column dropped)
--
-- Section 1 therefore resolves the column name at runtime via dynamic SQL and
-- reports the state it found. Section 0 fails FAST with a plain-English message
-- if #56 was never applied, instead of erroring on a missing secret_enc.
--
-- GATE FOR #57 / #58: "remaining_plaintext" must be 0 for both tables.
-- ============================================================


-- ── 0. Preflight — is #56 actually applied? ─────────────────────────────────
do $$
begin
  if to_regclass('public.payout_accounts') is null then
    raise exception
      'payout_accounts does not exist. Migration #40 (payout-info.sql) has not been applied.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payout_accounts'
                    and column_name='secret_enc') then
    raise exception
      'payout_accounts.secret_enc is missing — migration #56 (payout-encryption-expand.sql) has NOT been applied. Apply it before running this verification.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payout_requests'
                    and column_name='snap_secret_enc') then
    raise exception
      'payout_requests.snap_secret_enc is missing — migration #56 is only partially applied. Re-run payout-encryption-expand.sql.';
  end if;

  raise notice 'Preflight OK: #56 columns present.';
end $$;


-- ── 1. Coverage rollup (the go/no-go report) ────────────────────────────────
-- Dynamic: resolves whichever plaintext column name currently exists.
do $$
declare
  v_acct_pt  text;
  v_req_pt   text;
  v_total    bigint;
  v_enc      bigint;
  v_remain   bigint;
  v_nolast4  bigint;
  v_state    text;
begin
  select column_name into v_acct_pt
    from information_schema.columns
   where table_schema='public' and table_name='payout_accounts'
     and column_name in ('card_number','card_number_legacy_dropme')
   order by column_name limit 1;

  select column_name into v_req_pt
    from information_schema.columns
   where table_schema='public' and table_name='payout_requests'
     and column_name in ('snap_card_number','snap_card_number_legacy_dropme')
   order by column_name limit 1;

  v_state := case
    when v_acct_pt = 'card_number'              then 'phase 2 (post-#56, pre-#57)'
    when v_acct_pt = 'card_number_legacy_dropme' then 'phase 3A (post-#57, plaintext retired)'
    when v_acct_pt is null                       then 'phase 3B (plaintext dropped)'
    else 'unknown'
  end;
  raise notice '--- Schema state: % ---', v_state;

  -- payout_accounts
  execute format(
    'select count(*), count(*) filter (where secret_enc is not null), %s, '
    '       count(*) filter (where secret_enc is not null and secret_last4 is null) from public.payout_accounts',
    case when v_acct_pt is null then '0::bigint'
         else format('count(*) filter (where secret_enc is null and %I is not null)', v_acct_pt) end)
    into v_total, v_enc, v_remain, v_nolast4;

  raise notice 'payout_accounts : total=%  encrypted=%  remaining_plaintext=%  missing_last4=%  -> %',
    v_total, v_enc, v_remain, v_nolast4,
    case when v_remain = 0 then 'READY' else 'BACKFILL INCOMPLETE' end;

  -- payout_requests
  execute format(
    'select count(*), count(*) filter (where snap_secret_enc is not null), %s, '
    '       count(*) filter (where snap_secret_enc is not null and snap_secret_last4 is null) from public.payout_requests',
    case when v_req_pt is null then '0::bigint'
         else format('count(*) filter (where snap_secret_enc is null and %I is not null)', v_req_pt) end)
    into v_total, v_enc, v_remain, v_nolast4;

  raise notice 'payout_requests : total=%  encrypted=%  remaining_plaintext=%  missing_last4=%  -> %',
    v_total, v_enc, v_remain, v_nolast4,
    case when v_remain = 0 then 'READY' else 'BACKFILL INCOMPLETE' end;
end $$;


-- ── 2. key_version distribution (rotation readiness) ────────────────────────
select 'payout_accounts' as table_name, key_version, count(*) as rows
  from public.payout_accounts where secret_enc is not null group by key_version
union all
select 'payout_requests', snap_key_version, count(*)
  from public.payout_requests where snap_secret_enc is not null group by snap_key_version
 order by table_name, key_version;


-- ── 3. Integrity checks ─────────────────────────────────────────────────────
-- (a) Stored last4 must equal the plaintext's last 4 WHILE BOTH still exist.
--     Skipped automatically once the plaintext column is gone.
do $$
declare
  v_acct_pt text; v_req_pt text; v_bad bigint;
begin
  select column_name into v_acct_pt from information_schema.columns
   where table_schema='public' and table_name='payout_accounts'
     and column_name in ('card_number','card_number_legacy_dropme') limit 1;

  if v_acct_pt is null then
    raise notice '(3a) payout_accounts: plaintext gone — last4 cross-check not applicable.';
  else
    execute format(
      'select count(*) from public.payout_accounts where secret_enc is not null and %I is not null '
      'and secret_last4 is distinct from right(%I, 4)', v_acct_pt, v_acct_pt) into v_bad;
    raise notice '(3a) payout_accounts last4 mismatches: %  -> %', v_bad,
      case when v_bad = 0 then 'OK' else 'INVESTIGATE — backfill mis-encoded' end;
  end if;

  select column_name into v_req_pt from information_schema.columns
   where table_schema='public' and table_name='payout_requests'
     and column_name in ('snap_card_number','snap_card_number_legacy_dropme') limit 1;

  if v_req_pt is null then
    raise notice '(3a) payout_requests: plaintext gone — last4 cross-check not applicable.';
  else
    execute format(
      'select count(*) from public.payout_requests where snap_secret_enc is not null and %I is not null '
      'and snap_secret_last4 is distinct from right(%I, 4)', v_req_pt, v_req_pt) into v_bad;
    raise notice '(3a) payout_requests last4 mismatches: %  -> %', v_bad,
      case when v_bad = 0 then 'OK' else 'INVESTIGATE — backfill mis-encoded' end;
  end if;
end $$;

-- (b) Ciphertext must never look like a raw PAN. Expect 0.
select count(*) as ciphertext_looks_like_plaintext
  from public.payout_accounts where secret_enc ~ '[0-9]{16}';

-- (c) Historical payout totals — must match the pre-backfill snapshot exactly.
select count(*) as paid_requests,
       coalesce(sum(amount), 0)            as gross_total,
       coalesce(sum(commission_amount), 0) as commission_total,
       coalesce(sum(payout_amount), 0)     as net_total
  from public.payout_requests where status = 'paid';

-- (d) Exactly one create_payout_request overload must exist (the 3-arg one).
select count(*) as overloads,
       to_regprocedure('public.create_payout_request(uuid, integer, text)') is not null as three_arg_present,
       to_regprocedure('public.create_payout_request(uuid, integer, text, text, text)') is null as legacy_absent
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'create_payout_request';
