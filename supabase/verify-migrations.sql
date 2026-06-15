-- ============================================================
-- XAYR — Migration verification (READ-ONLY)
-- ============================================================
-- Paste into Supabase Dashboard -> SQL Editor and Run. Changes NOTHING — it only
-- inspects the catalog and reports which of the 31 runbook migrations
-- (supabase/MIGRATIONS.md) are applied to THIS database.
--
-- Object names are taken verbatim from the migration files, so a ❌ means the
-- object truly isn't there. Run each section; each returns its own result table.
--
-- Status legend (rollup): ✅ APPLIED = all checks pass · ⚠️ PARTIAL = some pass
-- (migration half-applied or an older version) · ❌ MISSING = none pass.
-- ============================================================


-- ============================================================
-- SECTION 1 — Per-migration rollup (the headline report)
-- ============================================================
with raw(mig, feature, label, present) as (values
  -- 1 — core schema
  (1,  'core schema',            'table users',                     (to_regclass('public.users') is not null)),
  (1,  'core schema',            'table campaigns',                 (to_regclass('public.campaigns') is not null)),
  (1,  'core schema',            'table donations',                 (to_regclass('public.donations') is not null)),
  (1,  'core schema',            'table notifications',             (to_regclass('public.notifications') is not null)),
  (1,  'core schema',            'fn handle_new_user',              exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user')),
  (1,  'core schema',            'fn apply_donation',               exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_donation')),
  (1,  'core schema',            'fn is_admin',                     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin')),
  (1,  'core schema',            'trigger on_auth_user_created',    exists(select 1 from pg_trigger where tgname='on_auth_user_created' and not tgisinternal)),
  (1,  'core schema',            'trigger trg_apply_donation',      exists(select 1 from pg_trigger where tgname='trg_apply_donation' and not tgisinternal)),

  -- 2 — verification
  (2,  'verification',           'table verification_requests',     (to_regclass('public.verification_requests') is not null)),
  (2,  'verification',           'table identity_documents',        (to_regclass('public.identity_documents') is not null)),
  (2,  'verification',           'col users.verification_status',   exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='verification_status')),
  (2,  'verification',           'fn is_verified',                  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_verified')),
  (2,  'verification',           'trigger trg_enforce_publish',     exists(select 1 from pg_trigger where tgname='trg_enforce_publish' and not tgisinternal)),
  (2,  'verification',           'bucket verification-documents',   exists(select 1 from storage.buckets where id='verification-documents')),

  -- 3 — user verification fields
  (3,  'user verif fields',      'col users.verified_at',           exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='verified_at')),
  (3,  'user verif fields',      'col users.rejection_reason',      exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='rejection_reason')),

  -- 4 — remove phone verification (expect the leftover to be GONE)
  (4,  'remove phone verif',     'phone_verifications absent',      (to_regclass('public.phone_verifications') is null)),

  -- 5 — tamper-proof donations RLS
  (5,  'secure donations RLS',   'policy donations_insert_pending', exists(select 1 from pg_policies where schemaname='public' and tablename='donations' and policyname='donations_insert_pending')),
  (5,  'secure donations RLS',   'open insert removed',             (not exists(select 1 from pg_policies where schemaname='public' and tablename='donations' and policyname='donations_insert_any'))),

  -- 6 — protected campaign fields
  (6,  'secure campaign fields', 'fn guard_campaign_protected_fields', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='guard_campaign_protected_fields')),
  (6,  'secure campaign fields', 'trigger trg_campaign_field_guard',   exists(select 1 from pg_trigger where tgname='trg_campaign_field_guard' and not tgisinternal)),

  -- 7 — campaign_donors view
  (7,  'campaign_donors view',   'view campaign_donors',            (to_regclass('public.campaign_donors') is not null)),

  -- 8 — completion reports
  (8,  'completion reports',     'table campaign_reports',          (to_regclass('public.campaign_reports') is not null)),
  (8,  'completion reports',     'bucket campaign-reports',         exists(select 1 from storage.buckets where id='campaign-reports')),

  -- 9 — admin dashboard
  (9,  'admin dashboard',        'view admin_stats',                (to_regclass('public.admin_stats') is not null)),

  -- 10 — search/listing indexes
  (10, 'campaign indexes',       'extension pg_trgm',               exists(select 1 from pg_extension where extname='pg_trgm')),
  (10, 'campaign indexes',       'index idx_campaigns_title_trgm',  exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_campaigns_title_trgm')),
  (10, 'campaign indexes',       'index idx_campaigns_active_new',  exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_campaigns_active_new')),

  -- 11 — campaign images
  (11, 'campaign images',        'col campaigns.images',            exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='images')),
  (11, 'campaign images',        'bucket campaign-images',          exists(select 1 from storage.buckets where id='campaign-images')),

  -- 12 — preferred language
  (12, 'preferred language',     'col users.preferred_language',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='preferred_language')),

  -- 13 — campaign flags
  (13, 'campaign flags',         'table campaign_flags',            (to_regclass('public.campaign_flags') is not null)),

  -- 14 — donor notifications
  (14, 'donor notifications',    'fn notify_on_campaign_milestone', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_on_campaign_milestone')),
  (14, 'donor notifications',    'fn notify_donors_on_update',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_donors_on_update')),
  (14, 'donor notifications',    'fn notify_donors_on_report',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_donors_on_report')),

  -- 15 — update attachments
  (15, 'update attachments',     'col campaign_updates.images',     exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_updates' and column_name='images')),
  (15, 'update attachments',     'col campaign_updates.documents',  exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_updates' and column_name='documents')),

  -- 16 — view tracking
  (16, 'view tracking',          'fn increment_campaign_views',     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='increment_campaign_views')),
  (16, 'view tracking',          'fn record_campaign_view',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_campaign_view')),

  -- 17 — recently viewed
  (17, 'recently viewed',        'table recently_viewed',           (to_regclass('public.recently_viewed') is not null)),

  -- 18 — payouts
  (18, 'payouts',                'table payout_requests',           (to_regclass('public.payout_requests') is not null)),
  (18, 'payouts',                'table payout_request_events',     (to_regclass('public.payout_request_events') is not null)),
  (18, 'payouts',                'fn create_payout_request',        exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_payout_request')),
  (18, 'payouts',                'fn approve_payout_request',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_payout_request')),

  -- 19 — payout notifications
  (19, 'payout notifications',   'fn notify_on_payout_event',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_on_payout_event')),
  (19, 'payout notifications',   'trigger trg_notify_payout_event', exists(select 1 from pg_trigger where tgname='trg_notify_payout_event' and not tgisinternal)),

  -- 20 — creator followers
  (20, 'creator followers',      'table creator_followers',         (to_regclass('public.creator_followers') is not null)),
  (20, 'creator followers',      'fn notify_followers_on_campaign_launch', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_followers_on_campaign_launch')),

  -- 21 — donor profiles
  (21, 'donor profiles',         'fn get_donor_stats',              exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_donor_stats')),
  (21, 'donor profiles',         'col users.donor_stats_public',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='donor_stats_public')),
  (21, 'donor profiles',         'grant update(donor_stats_public)', exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and column_name='donor_stats_public' and privilege_type='UPDATE' and grantee in ('authenticated','public'))),

  -- 22 — profile photos
  (22, 'profile photos',         'bucket profile-photos',           exists(select 1 from storage.buckets where id='profile-photos')),

  -- 23 — campaign teams
  (23, 'campaign teams',         'table campaign_team_members',     (to_regclass('public.campaign_team_members') is not null)),
  (23, 'campaign teams',         'fn campaign_role',                exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='campaign_role')),

  -- 24 — contact messages
  (24, 'contact messages',       'table contact_messages',          (to_regclass('public.contact_messages') is not null)),

  -- 25 — campaign resubmit
  (25, 'campaign resubmit',      'fn resubmit_campaign',            exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resubmit_campaign')),

  -- 26 — payout commission
  (26, 'payout commission',      'col payout_requests.commission_amount', exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_requests' and column_name='commission_amount')),
  (26, 'payout commission',      'col payout_requests.payout_amount',     exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_requests' and column_name='payout_amount')),

  -- 27 — google oauth (handle_new_user coalesces name/picture)
  (27, 'google oauth',           'handle_new_user reads picture',   exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user' and pg_get_functiondef(p.oid) ilike '%picture%')),

  -- 28 — platform notifications
  (28, 'platform notifications', 'fn notify_owner_on_campaign_status',  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_owner_on_campaign_status')),
  (28, 'platform notifications', 'fn notify_on_verification_decision',  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_on_verification_decision')),
  (28, 'platform notifications', 'type verification allowed',       exists(select 1 from pg_constraint where conname='notifications_type_check' and pg_get_constraintdef(oid) ilike '%verification%')),

  -- 29 — push notifications
  (29, 'push notifications',     'table notification_preferences',  (to_regclass('public.notification_preferences') is not null)),

  -- 30 — campaign shares
  (30, 'campaign shares',        'table campaign_shares',           (to_regclass('public.campaign_shares') is not null)),
  (30, 'campaign shares',        'fn get_share_stats',              exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_share_stats')),

  -- 31 — admin donation management
  (31, 'admin donations',        'table admin_audit_log',           (to_regclass('public.admin_audit_log') is not null)),
  (31, 'admin donations',        'fn notify_on_donation_status',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_on_donation_status')),
  (31, 'admin donations',        'trigger trg_notify_donation_status', exists(select 1 from pg_trigger where tgname='trg_notify_donation_status' and not tgisinternal))
),
agg as (
  select mig, feature, count(*) total, count(*) filter (where present) ok
  from raw group by mig, feature
)
select
  mig as "#",
  feature,
  ok || '/' || total as checks,
  case when ok = 0 then '❌ MISSING'
       when ok = total then '✅ APPLIED'
       else '⚠️ PARTIAL' end as status
from agg
order by mig;


-- ============================================================
-- SECTION 2 — Object-level detail (drill-down: every individual check)
-- Re-run with the same VALUES list; shows exactly which object is missing.
-- ============================================================
with raw(mig, feature, label, present) as (values
  (1,'core schema','table users',(to_regclass('public.users') is not null)),
  (1,'core schema','table campaigns',(to_regclass('public.campaigns') is not null)),
  (1,'core schema','table donations',(to_regclass('public.donations') is not null)),
  (1,'core schema','table notifications',(to_regclass('public.notifications') is not null)),
  (1,'core schema','fn apply_donation',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_donation')),
  (2,'verification','table verification_requests',(to_regclass('public.verification_requests') is not null)),
  (2,'verification','col users.verification_status',exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='verification_status')),
  (2,'verification','bucket verification-documents',exists(select 1 from storage.buckets where id='verification-documents')),
  (3,'user verif fields','col users.verified_at',exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='verified_at')),
  (4,'remove phone verif','phone_verifications absent',(to_regclass('public.phone_verifications') is null)),
  (5,'secure donations RLS','policy donations_insert_pending',exists(select 1 from pg_policies where tablename='donations' and policyname='donations_insert_pending')),
  (6,'secure campaign fields','trigger trg_campaign_field_guard',exists(select 1 from pg_trigger where tgname='trg_campaign_field_guard' and not tgisinternal)),
  (7,'campaign_donors view','view campaign_donors',(to_regclass('public.campaign_donors') is not null)),
  (8,'completion reports','table campaign_reports',(to_regclass('public.campaign_reports') is not null)),
  (8,'completion reports','bucket campaign-reports',exists(select 1 from storage.buckets where id='campaign-reports')),
  (9,'admin dashboard','view admin_stats',(to_regclass('public.admin_stats') is not null)),
  (10,'campaign indexes','index idx_campaigns_title_trgm',exists(select 1 from pg_indexes where indexname='idx_campaigns_title_trgm')),
  (11,'campaign images','col campaigns.images',exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='images')),
  (11,'campaign images','bucket campaign-images',exists(select 1 from storage.buckets where id='campaign-images')),
  (12,'preferred language','col users.preferred_language',exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='preferred_language')),
  (13,'campaign flags','table campaign_flags',(to_regclass('public.campaign_flags') is not null)),
  (14,'donor notifications','fn notify_on_campaign_milestone',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_on_campaign_milestone')),
  (15,'update attachments','col campaign_updates.documents',exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_updates' and column_name='documents')),
  (16,'view tracking','fn increment_campaign_views',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='increment_campaign_views')),
  (17,'recently viewed','table recently_viewed',(to_regclass('public.recently_viewed') is not null)),
  (18,'payouts','table payout_requests',(to_regclass('public.payout_requests') is not null)),
  (18,'payouts','table payout_request_events',(to_regclass('public.payout_request_events') is not null)),
  (19,'payout notifications','trigger trg_notify_payout_event',exists(select 1 from pg_trigger where tgname='trg_notify_payout_event' and not tgisinternal)),
  (20,'creator followers','table creator_followers',(to_regclass('public.creator_followers') is not null)),
  (21,'donor profiles','fn get_donor_stats',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_donor_stats')),
  (21,'donor profiles','grant update(donor_stats_public)',exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and column_name='donor_stats_public' and privilege_type='UPDATE')),
  (22,'profile photos','bucket profile-photos',exists(select 1 from storage.buckets where id='profile-photos')),
  (23,'campaign teams','table campaign_team_members',(to_regclass('public.campaign_team_members') is not null)),
  (24,'contact messages','table contact_messages',(to_regclass('public.contact_messages') is not null)),
  (25,'campaign resubmit','fn resubmit_campaign',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resubmit_campaign')),
  (26,'payout commission','col payout_requests.commission_amount',exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_requests' and column_name='commission_amount')),
  (27,'google oauth','handle_new_user reads picture',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user' and pg_get_functiondef(p.oid) ilike '%picture%')),
  (28,'platform notifications','fn notify_owner_on_campaign_status',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_owner_on_campaign_status')),
  (28,'platform notifications','type verification allowed',exists(select 1 from pg_constraint where conname='notifications_type_check' and pg_get_constraintdef(oid) ilike '%verification%')),
  (29,'push notifications','table notification_preferences',(to_regclass('public.notification_preferences') is not null)),
  (30,'campaign shares','table campaign_shares',(to_regclass('public.campaign_shares') is not null)),
  (30,'campaign shares','fn get_share_stats',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_share_stats')),
  (31,'admin donations','table admin_audit_log',(to_regclass('public.admin_audit_log') is not null)),
  (31,'admin donations','trigger trg_notify_donation_status',exists(select 1 from pg_trigger where tgname='trg_notify_donation_status' and not tgisinternal))
)
select mig as "#", feature, label as object,
  case when present then '✅' else '❌' end as ok
from raw
order by mig, label;


-- ============================================================
-- SECTION 3 — The seven requested features (direct answer)
-- ============================================================
select feature,
  case when present then '✅ APPLIED' else '❌ MISSING' end as status,
  detail
from (
  select 'notifications'   as feature,
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_on_campaign_milestone')
         and exists(select 1 from pg_constraint where conname='notifications_type_check' and pg_get_constraintdef(oid) ilike '%verification%') as present,
         'donor-notifications.sql (#14) + platform-notifications.sql (#28)' as detail
  union all
  select 'payouts',
         (to_regclass('public.payout_requests') is not null) and (to_regclass('public.payout_request_events') is not null)
         and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_payout_request'),
         'payouts.sql (#18) + payout-notifications.sql (#19) + payout-commission.sql (#26)'
  union all
  select 'donor profiles',
         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_donor_stats')
         and exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='donor_stats_public'),
         'donor-profiles.sql (#21)'
  union all
  select 'shares',
         (to_regclass('public.campaign_shares') is not null)
         and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_share_stats'),
         'campaign-shares.sql (#30)'
  union all
  select 'push notifications',
         (to_regclass('public.notification_preferences') is not null),
         'push-notifications.sql (#29)'
  union all
  select 'reports',
         (to_regclass('public.campaign_reports') is not null)
         and exists(select 1 from storage.buckets where id='campaign-reports'),
         'campaign-completion-reports.sql (#8)'
  union all
  select 'teams',
         (to_regclass('public.campaign_team_members') is not null)
         and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='campaign_role'),
         'campaign-teams.sql (#23)'
) f
order by feature;
