-- ============================================================
-- XAYR — Drop the legacy 5-argument create_payout_request (migration #59)
-- ============================================================
-- WHY THIS OVERLOAD EXISTS
--   PostgreSQL treats different argument lists as DISTINCT functions, so
--   create_payout_request has two independent overloads in this project's
--   history:
--
--     (uuid, integer, text, text, text)  -- LEGACY. Created by payouts.sql (#18),
--                                           replaced by payout-commission.sql (#26),
--                                           dropped by payout-info.sql (#40).
--     (uuid, integer, text)              -- CURRENT. Created by #40, then replaced
--                                           by #51 (4% rate), #56 and #57.
--
--   #40 retired the 5-arg form for a SECURITY reason, stated in its own comment:
--   "the method/account come from the saved payout account, not the client."
--   The legacy form accepted p_method and p_account_details FROM THE CALLER, so a
--   crafted RPC call could supply an arbitrary payout destination. The 3-arg form
--   sources and snapshots those server-side from payout_accounts instead.
--
--   The overload can nonetheless still be present, because BOTH #18 and #26
--   contain `create or replace function` AND `grant execute ... to authenticated`
--   for the 5-arg signature, and every migration in this project is documented as
--   "idempotent — safe to re-run". Re-running #18 or #26 after #40 — during
--   troubleshooting, a partial replay, or a fresh-install rebuild that revisits an
--   earlier file — silently RECREATES the dropped function and RE-GRANTS EXECUTE
--   to `authenticated`. Nothing in the app calls it, so it fails silently open:
--   a dormant, client-trusting entry point with no visible symptom.
--
--   Historical migrations are treated as IMMUTABLE, so #18/#26/#40 are not edited.
--   This forward-only migration removes the artifact instead, and the verifier
--   gains an assertion so a future resurrection is detected rather than assumed
--   away.
--
-- WHAT THIS DOES
--   • Revokes EXECUTE on the legacy overload from public/anon/authenticated
--     (explicit, though DROP FUNCTION would discard the grants anyway).
--   • Drops the legacy overload IF it exists.
--   • Leaves the CURRENT 3-arg function completely untouched — a different
--     function object; dropping one overload cannot affect the other.
--
-- WHAT THIS DOES NOT DO
--   No payment, ledger, commission, balance or payout business logic changes.
--   No table, column, trigger, policy or data is touched. If the legacy overload
--   is already absent (the expected state after #40), this migration is a no-op.
--
-- SAFETY
--   Verified before writing: the ONLY application call site is
--   components/campaigns/CampaignPayouts.tsx, which passes exactly
--   {p_campaign_id, p_amount, p_notes} and therefore resolves to the 3-arg
--   overload. types/index.ts types only the 3-arg shape, so a 5-arg call would
--   not compile.
--
-- Run in: Supabase Dashboard -> SQL Editor. Idempotent, forward-only.
-- Independent of #58 (phase 3B) — may be applied before or after it.
-- ============================================================

do $$
declare
  v_legacy regprocedure := to_regprocedure(
    'public.create_payout_request(uuid, integer, text, text, text)'
  );
begin
  if v_legacy is null then
    raise notice 'create_payout_request(uuid,integer,text,text,text) is already absent — nothing to do.';
    return;
  end if;

  -- Explicitly strip privileges first. REVOKE has no IF EXISTS, hence the guard.
  execute format('revoke all on function %s from public', v_legacy);
  execute format('revoke all on function %s from anon', v_legacy);
  execute format('revoke all on function %s from authenticated', v_legacy);

  execute format('drop function %s', v_legacy);

  raise notice 'Dropped legacy overload create_payout_request(uuid,integer,text,text,text).';
end $$;

-- ============================================================
-- VERIFY (read-only) — exactly ONE overload must remain, the 3-arg one:
--
--   select p.oid::regprocedure as signature,
--          pg_get_function_identity_arguments(p.oid) as args
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_payout_request'
--    order by 1;
--   -- expect exactly 1 row: create_payout_request(uuid,integer,text)
--
--   -- and no EXECUTE grant may remain for a 5-arg form:
--   select count(*) as legacy_grants
--     from information_schema.routine_privileges
--    where routine_schema='public' and routine_name='create_payout_request'
--      and grantee in ('anon','authenticated','PUBLIC');
--   -- the surviving grant(s) belong to the 3-arg function only.
--
-- ROLLBACK
--   Intentionally none. The legacy overload is a retired, client-trusting
--   signature that #40 already removed; re-creating it would reintroduce the
--   vulnerability. If it were ever needed, its body is preserved verbatim in the
--   git history of payouts.sql (#18) and payout-commission.sql (#26).
-- ============================================================
