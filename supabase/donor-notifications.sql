-- ============================================================
-- XAYR — Phase 2: Donor notifications
-- Notifies the DONORS of a campaign (not unrelated users) when:
--   1. the owner posts an update          (campaign_updates INSERT)
--   2. the campaign reaches its goal       (campaigns.current_amount crosses goal)
--   3. the campaign is marked completed    (campaigns.status -> 'completed')
--   4. a completion report is published    (campaign_reports INSERT)
--
-- Uses the EXISTING notifications table + enum types ('update','campaign_status').
-- No table/column changes. All functions are SECURITY DEFINER because the
-- notifications table has no INSERT RLS policy (same pattern as notify_on_comment).
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

-- ── Reusable fan-out: one notification per distinct donor, excluding owner ──
create or replace function public.notify_campaign_donors(
  p_campaign_id uuid,
  p_type        text,
  p_title       text,
  p_body        text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c_slug  text;
  c_owner uuid;
begin
  select slug, user_id into c_slug, c_owner
    from public.campaigns
   where id = p_campaign_id;

  if c_slug is null then
    return;
  end if;

  -- Donors = users with at least one COMPLETED donation to this campaign.
  -- `distinct` dedupes repeat donors; excluding the owner avoids self-notify.
  insert into public.notifications (user_id, type, title, body, link)
  select distinct d.donor_id, p_type, p_title, p_body, '/campaigns/' || c_slug
    from public.donations d
   where d.campaign_id = p_campaign_id
     and d.status      = 'completed'
     and d.donor_id is not null
     and d.donor_id <> c_owner;
end; $$;

-- ── 1. Owner posts an update ────────────────────────────────
create or replace function public.notify_donors_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_campaign_donors(
    new.campaign_id,
    'update',
    'Kampaniya yangiligi',
    'Siz qo''llab-quvvatlagan kampaniyada yangi yangilik chop etildi.'
  );
  return new;
end; $$;

-- ── 4. Completion report published ──────────────────────────
create or replace function public.notify_donors_on_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_campaign_donors(
    new.campaign_id,
    'update',
    'Yakuniy hisobot',
    'Siz qo''llab-quvvatlagan kampaniya yakuniy hisobotini chop etdi.'
  );
  return new;
end; $$;

-- ── 2 + 3. Goal reached / campaign completed ────────────────
-- AFTER UPDATE on campaigns. Each branch fires only on its transition, so a
-- given donor gets at most one "goal" and one "completed" notification.
create or replace function public.notify_on_campaign_milestone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Goal reached: current_amount crosses goal_amount upward (fires once).
  if new.goal_amount > 0
     and old.current_amount < new.goal_amount
     and new.current_amount >= new.goal_amount then
    perform public.notify_campaign_donors(
      new.id,
      'campaign_status',
      'Maqsadga erishildi',
      'Siz qo''llab-quvvatlagan kampaniya o''z maqsadiga erishdi!'
    );
  end if;

  -- Completed: status transitions to 'completed' (fires once).
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.notify_campaign_donors(
      new.id,
      'campaign_status',
      'Kampaniya yakunlandi',
      'Siz qo''llab-quvvatlagan kampaniya muvaffaqiyatli yakunlandi.'
    );
  end if;

  return new;
end; $$;

-- ── Triggers ────────────────────────────────────────────────
drop trigger if exists trg_notify_update on public.campaign_updates;
create trigger trg_notify_update
  after insert on public.campaign_updates
  for each row execute function public.notify_donors_on_update();

drop trigger if exists trg_notify_report on public.campaign_reports;
create trigger trg_notify_report
  after insert on public.campaign_reports
  for each row execute function public.notify_donors_on_report();

drop trigger if exists trg_notify_milestone on public.campaigns;
create trigger trg_notify_milestone
  after update on public.campaigns
  for each row execute function public.notify_on_campaign_milestone();
