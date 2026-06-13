-- ============================================================
-- XAYR — Complete platform notification system
-- ============================================================
-- Fills the gaps left by donor-notifications / payout-notifications /
-- creator-followers: those notify DONORS and FOLLOWERS, but the people who
-- own the affected entity were never told about admin DECISIONS. This adds:
--
--   CAMPAIGN owner (the creator):
--     • submitted  → campaign created as 'pending'        (under review)
--     • approved   → status pending/draft -> active       (went live)
--     • rejected   → status -> rejected                   (with resubmit hint)
--     • paused     → status active -> paused              (temporarily halted)
--
--   VERIFICATION applicant (the user):
--     • submitted  → verification_requests INSERT
--     • approved   → status -> verified
--     • rejected   → status -> rejected                   (with reason)
--
-- Reuses the existing notifications table + UI. All functions are SECURITY
-- DEFINER (the notifications table has no INSERT RLS policy — same pattern as
-- notify_on_comment / notify_on_payout_event), so they work regardless of
-- whether the change came from the admin UI (browser client) or the
-- verification API (service role).
--
-- Recipients are distinct from the existing triggers (owner/applicant here vs.
-- donors/followers there), so no event produces a duplicate notification.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql, verification.sql
-- and the other notification migrations). Idempotent — safe to re-run.
-- ============================================================

-- ── 0. Allow the new 'verification' notification type ───────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('general','donation','comment','campaign_status','update','verification'));

-- ── 1. Campaign owner: submission + moderation outcomes ─────────────────────
-- AFTER INSERT OR UPDATE. Recipient is always the campaign's own creator, so it
-- never overlaps notify_on_campaign_milestone (donors) or
-- notify_followers_on_campaign_launch (followers).
create or replace function public.notify_owner_on_campaign_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- New campaign entering moderation → confirm receipt.
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniya ko''rib chiqilmoqda',
              'Kampaniyangiz moderatsiyaga yuborildi. Tez orada ko''rib chiqamiz: ' || new.title,
              '/profile/campaigns');
    end if;
    return new;
  end if;

  -- Only react to a real status transition.
  if new.status is distinct from old.status then
    if new.status = 'active' and old.status in ('pending', 'draft') then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz tasdiqlandi',
              'Kampaniyangiz tasdiqlandi va e''lon qilindi: ' || new.title,
              '/campaigns/' || new.slug);

    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz rad etildi',
              'Kampaniyangiz moderatsiyadan o''tmadi. Ma''lumotlarni tahrirlab, qayta yuborishingiz mumkin: ' || new.title,
              '/profile/campaigns');

    elsif new.status = 'paused' and old.status = 'active' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz to''xtatildi',
              'Kampaniyangiz vaqtincha to''xtatildi: ' || new.title,
              '/campaigns/' || new.slug);
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_notify_owner_campaign_status on public.campaigns;
create trigger trg_notify_owner_campaign_status
  after insert or update on public.campaigns
  for each row execute function public.notify_owner_on_campaign_status();

-- ── 2. Verification applicant: submission ───────────────────────────────────
create or replace function public.notify_on_verification_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (new.user_id, 'verification', 'Tasdiqlash so''rovi qabul qilindi',
          'Shaxsingizni tasdiqlash so''rovingiz qabul qilindi va ko''rib chiqilmoqda.',
          '/profile');
  return new;
end; $$;

drop trigger if exists trg_notify_verification_submitted on public.verification_requests;
create trigger trg_notify_verification_submitted
  after insert on public.verification_requests
  for each row execute function public.notify_on_verification_submitted();

-- ── 3. Verification applicant: approved / rejected ──────────────────────────
create or replace function public.notify_on_verification_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'verified' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'verification', 'Hisobingiz tasdiqlandi',
              'Tabriklaymiz! Shaxsingiz tasdiqlandi. Endi kampaniya e''lon qilishingiz mumkin.',
              '/profile');

    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'verification', 'Tasdiqlash rad etildi',
              'Tasdiqlash so''rovingiz rad etildi.' ||
                case
                  when new.rejection_reason is not null
                       and length(trim(new.rejection_reason)) > 0
                  then ' Sabab: ' || new.rejection_reason
                  else ''
                end,
              '/profile');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_verification_decision on public.verification_requests;
create trigger trg_notify_verification_decision
  after update on public.verification_requests
  for each row execute function public.notify_on_verification_decision();
