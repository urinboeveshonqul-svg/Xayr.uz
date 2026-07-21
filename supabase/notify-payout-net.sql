-- ============================================================
-- XAYR — Payout notifications show the NET amount (migration #63)
-- ============================================================
-- Financial-consistency fix: notify_on_payout_event() worded every message with
-- the GROSS requested amount (pr.amount), while the creator actually RECEIVES the
-- net (pr.payout_amount = gross − commission). This recreates the function so the
-- notifications match every other surface:
--   • created  → requested (gross) + fee + net, so the creator sees all three
--   • approved → the NET that will be transferred
--   • paid     → the NET actually received
-- Values are READ from the row (never re-derived): the rate has changed over time
-- (0% pre-#26, 3% #26..#50, 4% from #51), and the DB CHECK guarantees fee+net=gross.
--
-- Function body only — no table/column/trigger/policy change. The AFTER INSERT
-- trigger on payout_request_events (from #19) is reused as-is. Idempotent.
-- Run in: Supabase Dashboard -> SQL Editor (after payout-notifications.sql / #19,
-- payout-commission.sql / #26, payout-info.sql / #40).
-- ============================================================

create or replace function public.notify_on_payout_event()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid;
  v_gross  integer;
  v_comm   integer;
  v_net    integer;
  v_title  text;   -- campaign title
  v_slug   text;
  g_amt    text;   -- space-grouped gross,  e.g. 1 500 000
  n_amt    text;   -- space-grouped net
  f_amt    text;   -- space-grouped fee
  n_title  text;
  n_body   text;
begin
  select pr.user_id, pr.amount, coalesce(pr.commission_amount, 0),
         coalesce(pr.payout_amount, pr.amount - coalesce(pr.commission_amount, 0)),
         c.title, c.slug
    into v_user, v_gross, v_comm, v_net, v_title, v_slug
    from public.payout_requests pr
    join public.campaigns c on c.id = pr.campaign_id
   where pr.id = new.request_id;

  if v_user is null then
    return new;
  end if;

  g_amt := replace(to_char(v_gross, 'FM999,999,999,999'), ',', ' ');
  n_amt := replace(to_char(v_net,   'FM999,999,999,999'), ',', ' ');
  f_amt := replace(to_char(v_comm,  'FM999,999,999,999'), ',', ' ');

  if new.action = 'created' then
    n_title := 'Yechish so''rovi yuborildi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || g_amt || ' so''m so''raldi'
               || ' (komissiya ' || f_amt || ', sof ' || n_amt || ' so''m). Ko''rib chiqilmoqda.';
  elsif new.action = 'approved' then
    n_title := 'Yechish so''rovi tasdiqlandi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || n_amt || ' so''m (sof) tasdiqlandi.';
  elsif new.action = 'rejected' then
    n_title := 'Yechish so''rovi rad etildi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || g_amt || ' so''m. Sabab: ' || coalesce(new.note, '—');
  elsif new.action = 'info_requested' then
    n_title := 'Qo''shimcha ma''lumot so''raldi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || g_amt || ' so''m. ' || coalesce(new.note, '');
  elsif new.action = 'paid' then
    n_title := 'To''lov amalga oshirildi';
    n_body  := coalesce(v_title, 'Kampaniya') || ': ' || n_amt || ' so''m (sof) to''landi.';
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

-- Trigger unchanged (reuse the one created by #19). Re-assert defensively:
drop trigger if exists trg_notify_payout_event on public.payout_request_events;
create trigger trg_notify_payout_event
  after insert on public.payout_request_events
  for each row execute function public.notify_on_payout_event();
