-- ============================================================
-- XAYR — Notification system health check (READ-ONLY)
-- ============================================================
-- Paste into Supabase Dashboard -> SQL Editor and Run. Changes nothing — it
-- only reports which notification triggers/functions are live in THIS database,
-- so you can tell whether silent notifications are a code gap (now fixed) or an
-- unapplied migration. Run each section; each returns its own result table.
-- ============================================================

-- ── 1. Are all notification TRIGGERS installed and enabled? ─────────────────
-- ❌ MISSING  → the migration that creates it was never run.
-- ⚠️ DISABLED → trigger exists but is turned off (tgenabled = 'D').
-- ✅ OK        → installed and firing.
select
  expected.event_covered,
  expected.tbl              as on_table,
  expected.trigger_name,
  expected.migration,
  case
    when c.oid is null     then '❌ TABLE MISSING'
    when t.tgname is null  then '❌ MISSING'
    when t.tgenabled = 'D' then '⚠️ DISABLED'
    else '✅ OK'
  end as status
from (values
  ('Donation received → creator',                                  'donations',             'trg_apply_donation',                'schema.sql'),
  ('Goal reached / completed → donors',                            'campaigns',             'trg_notify_milestone',              'donor-notifications.sql'),
  ('Campaign launched → followers',                                'campaigns',             'trg_notify_followers_launch',       'creator-followers.sql'),
  ('Approved/rejected/paused/completed/goal → creator',            'campaigns',             'trg_notify_owner_campaign_status',  'platform-notifications.sql'),
  ('Update published → donors',                                    'campaign_updates',      'trg_notify_update',                 'donor-notifications.sql'),
  ('Completion report published → donors',                         'campaign_reports',      'trg_notify_report',                 'donor-notifications.sql'),
  ('Withdrawal requested/approved/rejected/paid → creator',        'payout_request_events', 'trg_notify_payout_event',           'payout-notifications.sql'),
  ('Verification submitted → applicant',                           'verification_requests', 'trg_notify_verification_submitted', 'platform-notifications.sql'),
  ('Verification approved/rejected → applicant',                   'verification_requests', 'trg_notify_verification_decision',  'platform-notifications.sql')
) as expected(event_covered, tbl, trigger_name, migration)
left join pg_class c
  on c.relname = expected.tbl
 and c.relnamespace = 'public'::regnamespace
left join pg_trigger t
  on t.tgname = expected.trigger_name
 and t.tgrelid = c.oid
 and not t.tgisinternal
order by expected.tbl, expected.trigger_name;

-- ── 2. Are the notification FUNCTIONS present? ──────────────────────────────
select
  expected.fn as function_name,
  case when p.proname is null then '❌ MISSING' else '✅ OK' end as status
from (values
  ('apply_donation'),
  ('notify_on_comment'),
  ('notify_campaign_donors'),
  ('notify_donors_on_update'),
  ('notify_donors_on_report'),
  ('notify_on_campaign_milestone'),
  ('notify_followers_on_campaign_launch'),
  ('notify_on_payout_event'),
  ('notify_owner_on_campaign_status'),
  ('notify_on_verification_submitted'),
  ('notify_on_verification_decision')
) as expected(fn)
left join pg_proc p
  on p.proname = expected.fn
 and p.pronamespace = 'public'::regnamespace
order by expected.fn;

-- ── 3. Does the notifications.type constraint allow 'verification'? ──────────
-- ❌ here means platform-notifications.sql has not been applied.
select
  case
    when pg_get_constraintdef(oid) like '%verification%'
      then '✅ verification type allowed'
    else '❌ MISSING — run platform-notifications.sql'
  end as notifications_type_constraint,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.notifications'::regclass
  and conname  = 'notifications_type_check';

-- ── 4. What has actually been generated so far? ─────────────────────────────
-- Sanity snapshot: counts per type + how many are unread. An empty result, or
-- types missing here that you expect, points back to sections 1–3.
select
  type,
  count(*)                                as total,
  count(*) filter (where not is_read)     as unread,
  max(created_at)                         as most_recent
from public.notifications
group by type
order by total desc;
