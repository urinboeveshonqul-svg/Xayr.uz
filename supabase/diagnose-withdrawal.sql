-- ============================================================
-- XAYR — Withdrawal request DIAGNOSTIC (read-only; writes nothing)
-- ============================================================
-- Reproduces create_payout_request() AS THE REAL CREATOR inside a block that is
-- always rolled back, and prints the EXACT server error (SQLSTATE + message +
-- detail + hint + context) plus every schema pre-condition. Nothing is written.
--
-- HOW TO RUN:
--   1. Set v_slug below to the slug of the campaign whose withdrawal fails.
--   2. Paste the whole file into Supabase Dashboard -> SQL Editor -> Run.
--   3. Open the "Messages"/NOTICE output and send it back.
--
-- Safe: the only statement that could write (a successful RPC) is undone by the
-- final forced rollback; a failing RPC is rolled back to its savepoint. No row
-- ever persists.
-- ============================================================
do $$
declare
  v_slug     text := 'REPLACE_WITH_CAMPAIGN_SLUG';  -- <-- EDIT ME
  v_campaign uuid;
  v_user     uuid;
  v_status   text;
  v_avail    integer;
  v_amount   integer;
  v_new      uuid;
  v_col      text;
  v_state text; v_msg text; v_detail text; v_hint text; v_ctx text;
  r record;
begin
  raise notice '========== XAYR withdrawal diagnostic ==========';

  select id, user_id, status into v_campaign, v_user, v_status
    from public.campaigns where slug = v_slug;
  if v_campaign is null then
    raise notice 'Campaign slug "%" NOT FOUND — set v_slug to your test campaign slug.', v_slug;
    return;
  end if;
  raise notice 'campaign=%  owner=%  status=%', v_campaign, v_user, v_status;

  -- ── Required columns on payout_requests (from #26 + #40) ──
  foreach v_col in array array['commission_amount','payout_amount',
      'snap_card_type','snap_card_number','snap_cardholder_name','snap_phone','snap_bank_name']
  loop
    raise notice 'payout_requests.% : %', v_col,
      (select case when exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='payout_requests' and column_name=v_col)
       then 'OK' else '*** MISSING ***' end);
  end loop;

  -- ── payout_accounts (from #40 + #59) ──
  raise notice 'payout_accounts.card_number : %',
    (select case when exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='payout_accounts' and column_name='card_number')
     then 'OK' else '*** MISSING (#59 not applied) ***' end);
  raise notice 'payout_accounts row for owner : %',
    (select case when exists(select 1 from public.payout_accounts where user_id=v_user)
     then 'EXISTS' else '*** MISSING — creator has not saved payout info ***' end);

  -- ── financial_ledger extension (#46) — used by the AFTER-INSERT lifecycle trigger ──
  raise notice 'financial_ledger.user_id : %',
    (select case when exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='financial_ledger' and column_name='user_id')
     then 'OK' else '*** MISSING (#46 not applied) ***' end);
  raise notice 'financial_ledger.reference_id : %',
    (select case when exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='financial_ledger' and column_name='reference_id')
     then 'OK' else '*** MISSING (#46 not applied) ***' end);
  raise notice 'entry_type CHECK has withdrawal_requested : %',
    (select case when exists(select 1 from pg_constraint
       where conname='financial_ledger_entry_type_check'
         and pg_get_constraintdef(oid) ilike '%withdrawal_requested%')
     then 'OK'
     else '*** NO — the AFTER-INSERT lifecycle trigger WILL FAIL every withdrawal ***' end);

  -- ── Triggers actually installed on payout_requests ──
  for r in select tgname from pg_trigger
            where tgrelid='public.payout_requests'::regclass and not tgisinternal loop
    raise notice 'trigger on payout_requests : %', r.tgname;
  end loop;

  -- ── create_payout_request signatures present ──
  for r in select oid::regprocedure::text as sig from pg_proc
            where proname='create_payout_request' and pronamespace='public'::regnamespace loop
    raise notice 'function present : %', r.sig;
  end loop;

  -- ── Reproduce the RPC as the authenticated creator (rolled back) ──
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims',
            json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  v_avail := public.campaign_available_balance(v_campaign);
  raise notice 'campaign_available_balance (gross) : %', v_avail;
  v_amount := greatest(5000, least(coalesce(v_avail,0), 5208));  -- a valid gross if funds exist
  raise notice 'attempting create_payout_request(amount=%) ...', v_amount;

  begin
    v_new := public.create_payout_request(v_campaign, v_amount, 'DIAGNOSTIC — rolled back');
    raise notice '>>> RPC SUCCEEDED (request % — will be rolled back, nothing kept)', v_new;
  exception when others then
    get stacked diagnostics
      v_state  = returned_sqlstate,
      v_msg    = message_text,
      v_detail = pg_exception_detail,
      v_hint   = pg_exception_hint,
      v_ctx    = pg_exception_context;
    raise notice '>>> RPC FAILED — this is the real error:';
    raise notice '    SQLSTATE : %', v_state;
    raise notice '    MESSAGE  : %', v_msg;
    raise notice '    DETAIL   : %', coalesce(v_detail, '(none)');
    raise notice '    HINT     : %', coalesce(v_hint, '(none)');
    raise notice '    CONTEXT  : %', coalesce(v_ctx, '(none)');
  end;

  raise exception 'XAYR_DIAGNOSTIC_ROLLBACK';  -- undo everything; keep no rows
exception when others then
  if sqlerrm <> 'XAYR_DIAGNOSTIC_ROLLBACK' then
    raise notice 'diagnostic wrapper error: % / %', sqlstate, sqlerrm;
  end if;
  raise notice '========== diagnostic complete (all changes rolled back) ==========';
end $$;
