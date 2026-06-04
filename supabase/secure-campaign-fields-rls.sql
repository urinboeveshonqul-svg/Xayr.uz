-- ============================================================
-- XAYR — P0 FIX: Campaign protected-field authorization
-- Run in: Supabase Dashboard → SQL Editor (AFTER the master migration
-- and verification.sql). Safe to re-run (idempotent).
--
-- PROBLEM
--   The campaigns_update_own RLS policy gates WHICH ROWS an owner may
--   update, but PostgreSQL RLS cannot gate WHICH COLUMNS change. A campaign
--   owner could therefore PATCH status / current_amount / donors_count /
--   views and fabricate fundraising totals.
--
-- WHY NOT COLUMN GRANTS (the users.role approach)?
--   Admins change campaign.status through their OWN authenticated session
--   (components/admin/AdminCampaignsManager.tsx), not the service-role key.
--   Column GRANTs are role-based and cannot tell an admin apart from an
--   owner — both are the `authenticated` Postgres role. We need a RUNTIME
--   is_admin() check, so column rules are enforced in a trigger (the same
--   pattern as public.enforce_campaign_publish()).
--
-- AUTHORIZATION MODEL
--   Owner MAY edit  : title, description, goal_amount, category_id, images
--                     (also image_url, story, is_urgent, deadline, location)
--   Owner may NOT   : status, current_amount, donors_count, views
--   Only admins (or the SECURITY DEFINER donation-credit path) write those.
-- ============================================================


-- ── 1. Guard: protected campaign fields are admin-only ──────
create or replace function public.guard_campaign_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Privileged writers may set anything:
  --   • admins, acting through their own session
  --   • the donation-credit trigger, which opts in via a txn-local flag
  if public.is_admin()
     or current_setting('app.guard_campaign_bypass', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new campaign always starts empty; an owner can neither seed fake
    -- totals nor self-activate. (enforce_campaign_publish then clamps an
    -- unverified author's 'pending' down to 'draft'.)
    new.current_amount := 0;
    new.donors_count   := 0;
    new.views          := 0;
    if new.status is null or new.status not in ('draft', 'pending') then
      new.status := 'pending';
    end if;

  elsif tg_op = 'UPDATE' then
    -- Protected fields are immutable for owners: keep the stored values
    -- regardless of what the client tried to send.
    new.status         := old.status;
    new.current_amount := old.current_amount;
    new.donors_count   := old.donors_count;
    new.views          := old.views;
  end if;

  return new;
end; $$;

-- The name sorts BEFORE trg_campaigns_updated and trg_enforce_publish, so the
-- guard runs first (clamps active->pending on insert) and the publish gate
-- runs last (clamps pending->draft for unverified authors).
drop trigger if exists trg_campaign_field_guard on public.campaigns;
create trigger trg_campaign_field_guard
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_protected_fields();


-- ── 2. Let the donation-credit trigger write protected fields ─
-- apply_donation() runs as the donor; when a payment is completed by the
-- service role, auth.uid() is null, so is_admin() is false. It opts into the
-- guard bypass for the single UPDATE that credits the campaign, then clears
-- the flag. (Bypass is transaction-local — set_config(..., is_local => true).)
create or replace function public.apply_donation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from 'completed') then

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
  end if;
  return new;
end; $$;


-- ── 3. (RLS unchanged, documented) ─────────────────────────
-- campaigns_update_own stays as the ROW-level ownership gate. Column-level
-- protection is now the trg_campaign_field_guard trigger above. Re-asserting
-- here for clarity / idempotency:
drop policy if exists campaigns_update_own on public.campaigns;
create policy campaigns_update_own on public.campaigns for update
  using      (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- VERIFY (optional sanity checks, run as a non-admin owner):
--   -- allowed:
--   update public.campaigns set title = 'New title' where id = '<own-id>';
--   -- silently ignored (values stay put — no error, no change):
--   update public.campaigns set current_amount = 999999999,
--          status = 'active', donors_count = 1000, views = 1000000
--    where id = '<own-id>';
-- ============================================================
