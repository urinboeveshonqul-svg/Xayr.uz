-- ============================================================
-- XAYR — Admin workflow improvements
-- ============================================================
-- 1. Campaign rejection reasons (admin enters, owner sees).
-- 2. Platform revenue in the admin stats view (withdrawal commission on paid
--    payouts; summed from stored commission_amount, so mixed historical rates
--    total correctly — the rate itself is set by #51).
-- 3. Reject notification to the owner now includes the reason.
--
-- Run in: Supabase Dashboard -> SQL Editor (after platform-notifications.sql +
-- payout-commission.sql). Idempotent.
-- ============================================================

-- ── 1. Rejection reason on campaigns ────────────────────────────────────────
-- Admin-written (the field guard lets is_admin() set any column); owners read it
-- on their My Campaigns list. Not a protected column, so no guard change needed.
alter table public.campaigns
  add column if not exists rejection_reason text;

-- ── 2. Admin stats: add platform revenue ────────────────────────────────────
-- revenue = commission actually collected (paid payouts). total_raised stays the
-- gross donated amount; revenue is what the platform earned.
create or replace view public.admin_stats
  with (security_invoker = false) as
select
  (select count(*) from public.users)::int                                                   as users_count,
  (select count(*) from public.campaigns)::int                                               as campaigns_count,
  (select count(*) from public.campaigns where status = 'active')::int                       as active_count,
  (select count(*) from public.campaigns where status = 'pending')::int                      as pending_count,
  (select count(*) from public.campaigns where status = 'completed')::int                    as completed_count,
  (select count(*) from public.donations)::int                                               as donations_count,
  (select coalesce(sum(amount), 0) from public.donations where status = 'completed')::bigint  as total_raised,
  (select coalesce(sum(commission_amount), 0) from public.payout_requests where status = 'paid')::bigint as revenue;

revoke all on public.admin_stats from anon, authenticated;
grant select on public.admin_stats to service_role;

-- ── 3. Reject notification includes the reason ──────────────────────────────
-- Redefinition of the owner-status notifier (from platform-notifications.sql)
-- with the rejected branch appending rejection_reason when present.
create or replace function public.notify_owner_on_campaign_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniya ko''rib chiqilmoqda',
              'Kampaniyangiz moderatsiyaga yuborildi. Tez orada ko''rib chiqamiz: ' || new.title,
              '/profile/campaigns');
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'active' and old.status in ('pending', 'draft') then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz tasdiqlandi',
              'Kampaniyangiz tasdiqlandi va e''lon qilindi: ' || new.title,
              '/campaigns/' || new.slug);

    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz rad etildi',
              'Kampaniyangiz moderatsiyadan o''tmadi: ' || new.title ||
                case
                  when new.rejection_reason is not null
                       and length(trim(new.rejection_reason)) > 0
                  then '. Sabab: ' || new.rejection_reason
                  else ''
                end,
              '/profile/campaigns');

    elsif new.status = 'paused' and old.status = 'active' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz to''xtatildi',
              'Kampaniyangiz vaqtincha to''xtatildi: ' || new.title,
              '/campaigns/' || new.slug);

    elsif new.status = 'completed' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'campaign_status', 'Kampaniyangiz yakunlandi',
              'Tabriklaymiz! Kampaniyangiz muvaffaqiyatli yakunlandi: ' || new.title,
              '/campaigns/' || new.slug);
    end if;
  end if;

  if new.goal_amount > 0
     and old.current_amount < new.goal_amount
     and new.current_amount >= new.goal_amount then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.user_id, 'campaign_status', 'Maqsadga erishildi',
            'Kampaniyangiz o''z maqsadiga erishdi: ' || new.title,
            '/campaigns/' || new.slug);
  end if;

  return new;
end; $$;
