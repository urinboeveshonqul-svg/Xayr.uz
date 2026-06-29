-- ============================================================
-- XAYR — Campaign expiration & archive (Phase 1)
-- ============================================================
-- Adds the lifecycle states a fundraiser needs once its deadline passes, plus
-- the automation that flips them and keeps the public page reachable.
--
--   NEW statuses (campaigns.status):
--     • expired   — deadline passed, goal NOT reached (archived, public URL stays)
--     • funded    — deadline passed, goal reached      (archived, public URL stays)
--     • cancelled — owner/admin withdrew the campaign  (archived, NOT public)
--
--   expire_due_campaigns() flips every 'active' campaign whose deadline has
--   passed: → 'funded' if goal reached, else → 'expired'. Funded-before-deadline
--   campaigns stay 'active' until the deadline (per product spec).
--
--   RLS: campaigns_select_public is widened so 'completed'/'expired'/'funded'
--   stay publicly readable — their URLs and SEO keep working (Google can still
--   index them). Listings/search keep pinning status='active', so archived
--   campaigns never resurface in active discovery.
--
--   Donations: the app + apply_donation already gate on status='active'; the
--   donation API also rejects a past deadline. No money can be added to an
--   archived campaign.
--
-- Run in: Supabase Dashboard → SQL Editor (after platform-notifications.sql and
-- secure-campaign-fields-rls.sql). Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Allow the new lifecycle states ───────────────────────────────────────
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in (
    'draft','pending','active','rejected','completed','paused',
    'expired','funded','cancelled'
  ));

-- ── 2. Keep archived-but-public campaigns readable by anyone ─────────────────
-- Previously only 'active' was public, so an expired/funded/completed URL 404'd
-- for anonymous visitors (breaking SEO). Widen to the public archive states.
-- 'cancelled'/'paused'/'pending'/'rejected'/'draft' stay owner+admin only.
drop policy if exists campaigns_select_public on public.campaigns;
create policy campaigns_select_public on public.campaigns for select
  using (
    status in ('active','completed','expired','funded')
    or user_id = auth.uid()
    or public.is_admin()
  );

-- ── 3. Fast lookup of campaigns that are due to expire ──────────────────────
create index if not exists idx_campaigns_active_due
  on public.campaigns (deadline)
  where status = 'active';

-- ── 4. Auto-expire due campaigns ────────────────────────────────────────────
-- SECURITY DEFINER + the guard bypass flag (same pattern as apply_donation):
-- the field guard would otherwise revert a status write made outside an admin
-- session (cron/service role). Returns the number of campaigns transitioned.
create or replace function public.expire_due_campaigns()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  perform set_config('app.guard_campaign_bypass', 'on', true);

  with due as (
    update public.campaigns
       set status = case
                      when goal_amount > 0 and current_amount >= goal_amount then 'funded'
                      else 'expired'
                    end
     where status = 'active'
       and deadline is not null
       and deadline < now()
    returning 1
  )
  select count(*) into n from due;

  perform set_config('app.guard_campaign_bypass', 'off', true);
  return n;
end; $$;

-- Callable by the service role (the Vercel cron route uses the service key).
grant execute on function public.expire_due_campaigns() to service_role;

-- ── 5. Notify the owner on expiry / funding ─────────────────────────────────
-- A SEPARATE trigger from notify_owner_on_campaign_status(): its branches cover
-- active/rejected/paused/completed/goal, and these two new states are disjoint,
-- so no event ever produces a duplicate notification.
create or replace function public.notify_owner_on_campaign_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'expired' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniya muddati tugadi',
              'Kampaniyangiz muddati yakunlandi: ' || new.title ||
                '. Maqsadga to''liq erishilmadi — muddatni uzaytirishni so''rashingiz mumkin.',
              '/campaigns/' || new.slug);

    elsif new.status = 'funded' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniya muvaffaqiyatli moliyalashtirildi',
              'Tabriklaymiz! Kampaniyangiz o''z maqsadiga erishib yakunlandi: ' || new.title,
              '/campaigns/' || new.slug);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_owner_campaign_expiry on public.campaigns;
create trigger trg_notify_owner_campaign_expiry
  after update on public.campaigns
  for each row execute function public.notify_owner_on_campaign_expiry();

-- ── 6. (Optional) schedule without Vercel cron ──────────────────────────────
-- If the pg_cron extension is enabled, you can run the sweep in-database hourly
-- instead of (or in addition to) the Vercel cron route. Left commented so this
-- file stays portable across projects that don't have pg_cron.
--
--   select cron.schedule('expire-due-campaigns', '0 * * * *',
--                        $$ select public.expire_due_campaigns(); $$);

-- ============================================================
-- VERIFY:
--   -- create a past-deadline active campaign, then:
--   select public.expire_due_campaigns();          -- returns count flipped
--   select status from public.campaigns where id = '<id>';  -- expired | funded
-- ============================================================
