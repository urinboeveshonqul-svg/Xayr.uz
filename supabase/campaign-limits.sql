-- ============================================================
-- XAYR — Campaign creation/edit limits (goal ≤ 1,000,000,000 · duration ≤ 60d)
-- ============================================================
-- SERVER-SIDE enforcement of the goal + duration caps, so the rule holds even
-- though campaign EDITS are written client-direct (RLS) rather than through a
-- server route — mirrors the create route's checks and the forms' checks
-- (lib/campaign-limits.ts). Same pattern as guard_campaign_protected_fields().
--
-- NON-BREAKING for existing rows:
--   • The trigger fires on write, never on read, so stored campaigns are untouched.
--   • On UPDATE a cap is checked ONLY when that field actually changes, so a
--     grandfathered campaign (e.g. a legacy goal/deadline beyond the new caps)
--     can still edit its OTHER fields without being blocked.
--   • Admins and the donation-credit path (guard-bypass flag) are exempt.
--
-- Idempotent — safe to re-run. Run in: Supabase Dashboard → SQL Editor.
-- Depends on: public.campaigns, public.is_admin().
-- ============================================================

create or replace function public.guard_campaign_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  max_goal constant bigint := 1000000000;   -- 1,000,000,000 UZS
  max_days constant int    := 60;           -- days from the creation date
  creation timestamptz;
begin
  -- Privileged writers bypass (admins acting in their own session; the
  -- donation-credit trigger which opts in via the txn-local flag).
  if public.is_admin()
     or current_setting('app.guard_campaign_bypass', true) = 'on' then
    return new;
  end if;

  -- Goal cap — on insert, and on update only when the goal changes.
  if tg_op = 'INSERT' or new.goal_amount is distinct from old.goal_amount then
    if new.goal_amount is not null and new.goal_amount > max_goal then
      raise exception 'Campaign goal cannot exceed % UZS', max_goal
        using errcode = 'check_violation';
    end if;
  end if;

  -- Duration cap — end date within max_days of the creation date (now for a new
  -- campaign, the row's created_at when editing). Only when the deadline changes.
  creation := case when tg_op = 'INSERT' then now() else old.created_at end;
  if new.deadline is not null
     and (tg_op = 'INSERT' or new.deadline is distinct from old.deadline) then
    if new.deadline > (creation + make_interval(days => max_days))::date then
      raise exception 'Campaign duration cannot exceed % days', max_days
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end; $$;

-- Sorts after trg_campaign_field_guard (both BEFORE) — independent, order irrelevant.
drop trigger if exists trg_campaign_limits on public.campaigns;
create trigger trg_campaign_limits
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_limits();

-- ============================================================
-- VERIFY (run as a non-admin owner):
--   -- rejected:
--   update public.campaigns set goal_amount = 2000000000 where id = '<own-id>';
--   -- rejected:
--   update public.campaigns set deadline = (now() + interval '90 days')::date where id = '<own-id>';
-- ============================================================
