-- ============================================================
-- XAYR — Payout pay-time balance guard (migration #52, fixes audit F-2)
-- ============================================================
-- PROBLEM (F-2)
--   create_payout_request() checks `amount <= campaign_available_balance` at
--   REQUEST time. mark_payout_paid() did NOT re-check. A refund / chargeback
--   reversal that reduces campaigns.current_amount AFTER a request is created but
--   BEFORE it is paid could let the payout transfer more than the campaign truly
--   holds — money that was already returned to a donor (over-withdrawal).
--
-- FIX
--   Re-verify at PAY time, inside mark_payout_paid(), that the sum of already-PAID
--   payouts plus THIS request does not exceed the campaign's current (refund-
--   adjusted) current_amount. If it would, fail with 'insufficient_balance' and
--   leave the request 'approved' (safe — nothing is transferred, an admin can
--   re-review). The campaign row is locked FOR UPDATE so a concurrent
--   refund-credit reversal or a concurrent payout for the same campaign cannot
--   race the check.
--
--   This is the ONLY change: same signature, same admin/reference/status checks,
--   same event log, same optional paid_at. No schema, table, column, trigger,
--   RLS or workflow change. Nothing about request creation, approval, rejection,
--   info-request, refunds, balances or the redirect/Payme flows is touched.
--
-- DEPENDS ON: payout-info.sql (#40) — the 3-arg mark_payout_paid it replaces.
-- Run in: Supabase Dashboard -> SQL Editor (after #40). Idempotent.
-- ============================================================

create or replace function public.mark_payout_paid(
  p_request_id uuid,
  p_reference  text,
  p_paid_at    timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_amount   bigint;
  v_campaign uuid;
  v_current  bigint;
  v_paid     bigint;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'reference_required'; end if;

  -- Lock the request; also read its amount + campaign for the balance check.
  select status, amount, campaign_id
    into v_status, v_amount, v_campaign
    from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_status <> 'approved' then raise exception 'invalid_transition'; end if;

  -- ── F-2: re-verify balance at pay time ──────────────────────────────────────
  -- Lock the campaign row so a concurrent refund reversal (apply_donation) or a
  -- concurrent payout for the same campaign is serialized against this check.
  select coalesce(current_amount, 0) into v_current
    from public.campaigns where id = v_campaign for update;
  select coalesce(sum(amount), 0) into v_paid
    from public.payout_requests
   where campaign_id = v_campaign and status = 'paid';

  -- Total actually paid out (after this one) must never exceed the campaign's
  -- current, refund-adjusted balance.
  if v_paid + v_amount > v_current then
    raise exception 'insufficient_balance';
  end if;

  update public.payout_requests
     set status = 'paid', payout_reference = p_reference, paid_at = coalesce(p_paid_at, now())
   where id = p_request_id;

  insert into public.payout_request_events (request_id, actor_id, action, from_status, to_status, note)
  values (p_request_id, auth.uid(), 'paid', v_status, 'paid', p_reference);
end; $$;

grant execute on function public.mark_payout_paid(uuid, text, timestamptz) to authenticated;

-- ============================================================
-- VERIFY (read-only): the function body must contain the guard.
--   select pg_get_functiondef(p.oid) ilike '%insufficient_balance%' as has_guard
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'mark_payout_paid';
-- ============================================================
