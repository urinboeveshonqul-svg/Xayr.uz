-- ============================================================
-- XAYR — Payout notifications (Phase 4)
-- Notifies the campaign CREATOR on every payout status change by reusing the
-- existing notifications table + notification center. Every transition already
-- writes a payout_request_events row, so a single AFTER INSERT trigger covers
-- all of them (submitted / approved / rejected / info requested / paid).
--
-- Mirrors the notify_on_comment pattern (SECURITY DEFINER inserts a notification).
-- Run in: Supabase Dashboard -> SQL Editor (after payouts.sql). Safe to re-run.
-- ============================================================

create or replace function public.notify_on_payout_event()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid;
  v_amount  integer;
  v_title   text;   -- campaign title
  v_slug    text;
  v_amt     text;   -- space-grouped amount, e.g. 1 500 000
  n_title   text;
  n_body    text;
begin
  select pr.user_id, pr.amount, c.title, c.slug
    into v_user, v_amount, v_title, v_slug
    from public.payout_requests pr
    join public.campaigns c on c.id = pr.campaign_id
   where pr.id = new.request_id;

  if v_user is null then
    return new;
  end if;

  v_amt := replace(to_char(v_amount, 'FM999,999,999,999'), ',', ' ');

  if new.action = 'created' then
    n_title := 'Yechish so''rovi yuborildi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || v_amt || ' so''m. Ko''rib chiqilmoqda.';
  elsif new.action = 'approved' then
    n_title := 'Yechish so''rovi tasdiqlandi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || v_amt || ' so''m tasdiqlandi.';
  elsif new.action = 'rejected' then
    n_title := 'Yechish so''rovi rad etildi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || v_amt || ' so''m. Sabab: ' || coalesce(new.note, '—');
  elsif new.action = 'info_requested' then
    n_title := 'Qo''shimcha ma''lumot so''raldi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || v_amt || ' so''m. ' || coalesce(new.note, '');
  elsif new.action = 'paid' then
    n_title := 'To''lov amalga oshirildi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || v_amt || ' so''m to''landi.';
  else
    return new;  -- 'cancelled' or anything else: no notification
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_user,
    'campaign_status',
    n_title,
    n_body,
    case when v_slug is not null then '/campaigns/' || v_slug || '/analytics' else null end
  );

  return new;
end; $$;

drop trigger if exists trg_notify_payout_event on public.payout_request_events;
create trigger trg_notify_payout_event
  after insert on public.payout_request_events
  for each row execute function public.notify_on_payout_event();
