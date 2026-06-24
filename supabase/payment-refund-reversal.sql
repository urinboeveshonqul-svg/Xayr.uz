-- ============================================================
-- XAYR — M3: Refund / chargeback reversal safety
-- ============================================================
-- PROBLEM
--   apply_donation() only CREDITED a campaign when a donation became
--   'completed'. It never reversed the credit if that donation was later
--   refunded or failed. Because campaign_available_balance() = current_amount −
--   committed payouts, refunded funds stayed WITHDRAWABLE → a creator could cash
--   out money that was returned to the donor (money loss).
--
-- FIX
--   Redefine apply_donation() to also REVERSE current_amount / donors_count when
--   a 'completed' donation transitions to any non-completed status (refunded or
--   failed/charged-back). Totals are floored at 0, so refunded funds immediately
--   drop out of the payout-available balance and can no longer be withdrawn.
--
-- DEPENDS ON
--   • schema.sql            (donations, campaigns, notifications, the
--                            app.guard_campaign_bypass field guard)
--   • secure-donations-rls.sql (#5) — REQUIRED so current_amount is tamper-proof.
--     VERIFY #5 IS LIVE before relying on this (run verify-migrations.sql). Do
--     NOT enable real payments/payouts without it.
--
-- Run in: Supabase Dashboard -> SQL Editor (after #5/#6). Idempotent.
-- ============================================================

create or replace function public.apply_donation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ── Credit when a donation BECOMES completed ──────────────
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from 'completed') then

    -- Bypass the protected-field guard for this trusted credit (txn-local).
    perform set_config('app.guard_campaign_bypass', 'on', true);
    update public.campaigns
       set current_amount = current_amount + new.amount,
           donors_count   = donors_count + 1
     where id = new.campaign_id;
    perform set_config('app.guard_campaign_bypass', 'off', true);

    insert into public.notifications (user_id, type, title, body, link)
    select c.user_id, 'donation', 'Yangi xayriya',
           'Kampaniyangizga yangi xayriya tushdi.', '/campaigns/' || c.slug
      from public.campaigns c where c.id = new.campaign_id;

  -- ── Reverse when a completed donation LEAVES completed ─────
  --    (refunded / failed / charged back). Floored at 0 so totals never go
  --    negative and refunded funds leave the payout-available balance.
  elsif tg_op = 'UPDATE'
        and old.status = 'completed'
        and new.status is distinct from 'completed' then

    perform set_config('app.guard_campaign_bypass', 'on', true);
    update public.campaigns
       set current_amount = greatest(0, current_amount - old.amount),
           donors_count   = greatest(0, donors_count - 1)
     where id = new.campaign_id;
    perform set_config('app.guard_campaign_bypass', 'off', true);

    -- Tell the owner a contribution was reversed (audit + transparency).
    insert into public.notifications (user_id, type, title, body, link)
    select c.user_id, 'donation', 'Xayriya qaytarildi',
           'Kampaniyangizdagi bir xayriya bekor qilindi yoki qaytarildi.',
           '/campaigns/' || c.slug
      from public.campaigns c where c.id = new.campaign_id;
  end if;

  return new;
end; $$;

-- Trigger already exists from schema.sql (trg_apply_donation, AFTER INSERT OR
-- UPDATE on donations) and continues to call this function — re-assert for a
-- clean bootstrap.
drop trigger if exists trg_apply_donation on public.donations;
create trigger trg_apply_donation
  after insert or update on public.donations
  for each row execute function public.apply_donation();

-- ============================================================
-- VERIFY (optional):
--   -- credit then refund a test donation, confirm current_amount returns to
--   -- its prior value and never goes negative:
--   update public.donations set status='completed' where id='<test>';
--   update public.donations set status='refunded'  where id='<test>';
--   select current_amount, donors_count from public.campaigns where id='<cid>';
-- ============================================================
