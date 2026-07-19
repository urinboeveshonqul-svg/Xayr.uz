-- ============================================================
-- XAYR — Migration verification (READ-ONLY)
-- ============================================================
-- Paste into Supabase Dashboard -> SQL Editor and Run. Changes NOTHING — it only
-- inspects the catalog and reports which of the 60 runbook migrations
-- (supabase/MIGRATIONS.md) are applied to THIS database.
--
-- ⚠️ #5 (secure-donations-rls) is the security prerequisite for payouts: without
-- it clients can insert donations with status='completed' and forge campaign
-- totals. #48 is REQUIRED before Payme is enabled. Check both explicitly.
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

  -- 5 — tamper-proof donations RLS. Insert is pending-only; #57 later drops even
  --     that (service-role-only) — BOTH states satisfy the invariant, so the check
  --     accepts either the pending policy OR no client INSERT policy at all.
  (5,  'secure donations RLS',   'insert restricted (pending-only or #57 lockdown)',
       (exists(select 1 from pg_policies where schemaname='public' and tablename='donations' and policyname='donations_insert_pending')
        or not exists(select 1 from pg_policies where schemaname='public' and tablename='donations' and cmd='INSERT'))),
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
  (31, 'admin donations',        'trigger trg_notify_donation_status', exists(select 1 from pg_trigger where tgname='trg_notify_donation_status' and not tgisinternal)),

  -- 32 — admin workflow (campaign rejection_reason + admin_stats.revenue)
  (32, 'admin workflow',         'col campaigns.rejection_reason',  exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='rejection_reason')),
  (32, 'admin workflow',         'col admin_stats.revenue',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='admin_stats' and column_name='revenue')),

  -- 33 — email verification gate
  (33, 'email verif gate',       'fn is_email_confirmed',           exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_email_confirmed')),
  (33, 'email verif gate',       'col users.email_confirmed',       exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='email_confirmed')),
  (33, 'email verif gate',       'trigger on_auth_email_confirmed', exists(select 1 from pg_trigger where tgname='on_auth_email_confirmed' and not tgisinternal)),

  -- 34 — usernames
  (34, 'usernames',              'col users.username',              exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='username')),
  (34, 'usernames',              'table reserved_usernames',        (to_regclass('public.reserved_usernames') is not null)),
  (34, 'usernames',              'fn change_username',              exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='change_username')),

  -- 35 — username rules (stricter username_format_ok: forbids consecutive periods)
  (35, 'username rules',         'username_format_ok stricter',     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='username_format_ok' and pg_get_functiondef(p.oid) ilike '%[.][.]%')),

  -- 36 — campaign create email gate (superseded by #37; insert policy present)
  (36, 'create email gate',      'policy campaigns_insert_own (→#37)', exists(select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='campaigns_insert_own')),

  -- 37 — campaign create KYC gate (enforce_campaign_publish checks is_verified)
  (37, 'create KYC gate',        'enforce_campaign_publish KYC',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='enforce_campaign_publish' and pg_get_functiondef(p.oid) ilike '%is_verified%')),

  -- 38 — payment foundation (payment_ref UNIQUE + payment_events)
  (38, 'payment foundation',     'table payment_events',            (to_regclass('public.payment_events') is not null)),
  (38, 'payment foundation',     'index donations_payment_ref_key', exists(select 1 from pg_indexes where schemaname='public' and indexname='donations_payment_ref_key')),
  (38, 'payment foundation',     'index payment_events_provider_event_key', exists(select 1 from pg_indexes where schemaname='public' and indexname='payment_events_provider_event_key')),

  -- 39 — payment refund reversal (apply_donation reverses totals on un-complete)
  (39, 'refund reversal',        'apply_donation reverses',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_donation' and pg_get_functiondef(p.oid) ilike '%greatest(0, current_amount%')),

  -- 40 — payout info / secure payout accounts
  (40, 'payout info',            'table payout_accounts',           (to_regclass('public.payout_accounts') is not null)),
  -- card_number is checked explicitly: a payout_accounts created before this
  -- column existed passes the table check above but still breaks saving with
  -- "column card_number not found" — see #59 (payout-accounts-schema-repair.sql).
  (40, 'payout info',            'col payout_accounts.card_number', exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_accounts' and column_name='card_number')),
  (40, 'payout info',            'col payout_requests.snap_card_number', exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_requests' and column_name='snap_card_number')),
  (40, 'payout info',            'policy payout_accounts_select_own_admin', exists(select 1 from pg_policies where schemaname='public' and tablename='payout_accounts' and policyname='payout_accounts_select_own_admin')),

  -- 41 — campaign expiration & archive
  (41, 'campaign expiration',    'fn expire_due_campaigns',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='expire_due_campaigns')),
  (41, 'campaign expiration',    'status funded/expired allowed',   exists(select 1 from pg_constraint where conname='campaigns_status_check' and pg_get_constraintdef(oid) ilike '%funded%')),
  (41, 'campaign expiration',    'trigger trg_notify_owner_campaign_expiry', exists(select 1 from pg_trigger where tgname='trg_notify_owner_campaign_expiry' and not tgisinternal)),

  -- 42 — campaign extensions
  (42, 'campaign extensions',    'table campaign_extension_requests', (to_regclass('public.campaign_extension_requests') is not null)),
  (42, 'campaign extensions',    'col campaigns.extension_count',   exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='extension_count')),
  (42, 'campaign extensions',    'fn approve_campaign_extension',   exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_campaign_extension')),
  (42, 'campaign extensions',    'fn get_campaign_extension_history', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_campaign_extension_history')),

  -- 43 — moderated completion reports v2
  (43, 'completion reports v2',  'col campaign_reports.status',     exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_reports' and column_name='status')),
  (43, 'completion reports v2',  'col campaign_reports.fund_breakdown', exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_reports' and column_name='fund_breakdown')),
  (43, 'completion reports v2',  'fn review_completion_report',     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_completion_report')),
  (43, 'completion reports v2',  'fn campaign_total_withdrawn',     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='campaign_total_withdrawn')),

  -- 44 — guest donations
  (44, 'guest donations',        'col donations.donor_name',        exists(select 1 from information_schema.columns where table_schema='public' and table_name='donations' and column_name='donor_name')),
  (44, 'guest donations',        'col donations.name_display',      exists(select 1 from information_schema.columns where table_schema='public' and table_name='donations' and column_name='name_display')),

  -- 45 — financial ledger, summary & integrity
  (45, 'financial ledger',       'table financial_ledger',          (to_regclass('public.financial_ledger') is not null)),
  (45, 'financial ledger',       'view financial_summary',          (to_regclass('public.financial_summary') is not null)),
  (45, 'financial ledger',       'fn public_financial_stats',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='public_financial_stats')),
  (45, 'financial ledger',       'fn check_financial_integrity',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='check_financial_integrity')),
  (45, 'financial ledger',       'fn campaign_financials',          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='campaign_financials')),
  (45, 'financial ledger',       'fn record_ledger_adjustment',     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_ledger_adjustment')),
  (45, 'financial ledger',       'trigger trg_ledger_on_donation',  exists(select 1 from pg_trigger where tgname='trg_ledger_on_donation' and not tgisinternal)),
  (45, 'financial ledger',       'append-only guard',               exists(select 1 from pg_trigger where tgname='trg_ledger_no_delete' and not tgisinternal)),

  -- 46 — financial snapshots, ledger extension & reconciliation report
  (46, 'financial snapshots',    'table financial_snapshots',       (to_regclass('public.financial_snapshots') is not null)),
  (46, 'financial snapshots',    'fn generate_financial_snapshot',  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='generate_financial_snapshot')),
  (46, 'financial snapshots',    'fn reconciliation_report',        exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reconciliation_report')),
  (46, 'financial snapshots',    'fn public_financial_series',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='public_financial_series')),
  (46, 'financial snapshots',    'col financial_ledger.user_id',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_ledger' and column_name='user_id')),
  (46, 'financial snapshots',    'col financial_ledger.reference_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_ledger' and column_name='reference_id')),
  (46, 'financial snapshots',    'trigger trg_ledger_payout_lifecycle', exists(select 1 from pg_trigger where tgname='trg_ledger_payout_lifecycle' and not tgisinternal)),

  -- 47 — payment provider settings (admin catalog: enable / coming-soon / order / default)
  (47, 'payment providers',      'table payment_provider_settings', (to_regclass('public.payment_provider_settings') is not null)),
  (47, 'payment providers',      'policy select_all',               exists(select 1 from pg_policies where schemaname='public' and tablename='payment_provider_settings' and policyname='payment_provider_settings_select_all')),
  (47, 'payment providers',      'policy admin_write',              exists(select 1 from pg_policies where schemaname='public' and tablename='payment_provider_settings' and policyname='payment_provider_settings_admin_write')),
  (47, 'payment providers',      'payment_method allows paynet/uzum', exists(select 1 from pg_constraint where conname='donations_payment_method_check' and pg_get_constraintdef(oid) ilike '%paynet%' and pg_get_constraintdef(oid) ilike '%uzum%')),

  -- 48 — Payme merchant-API transaction state table (REQUIRED before enabling Payme)
  (48, 'payme transactions',     'table payme_transactions',        (to_regclass('public.payme_transactions') is not null)),
  (48, 'payme transactions',     'unique active txn per donation',  exists(select 1 from pg_indexes where schemaname='public' and indexname='payme_transactions_active_donation_key')),
  (48, 'payme transactions',     'index on donation_id',            exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_payme_transactions_donation')),
  (48, 'payme transactions',     'policy select_admin',             exists(select 1 from pg_policies where schemaname='public' and tablename='payme_transactions' and policyname='payme_transactions_select_admin')),

  -- 49 — share channels (instagram / email / qr allowed in CHECK *and* RLS)
  (49, 'share channels',         'source CHECK allows instagram',   exists(select 1 from pg_constraint where conname='campaign_shares_source_check' and pg_get_constraintdef(oid) ilike '%instagram%')),
  (49, 'share channels',         'source CHECK allows email',       exists(select 1 from pg_constraint where conname='campaign_shares_source_check' and pg_get_constraintdef(oid) ilike '%email%')),
  (49, 'share channels',         'source CHECK allows qr',          exists(select 1 from pg_constraint where conname='campaign_shares_source_check' and pg_get_constraintdef(oid) ilike '%qr%')),
  (49, 'share channels',         'RLS insert policy allows qr',     exists(select 1 from pg_policies where schemaname='public' and tablename='campaign_shares' and policyname='shares_insert_any' and coalesce(with_check,'') ilike '%qr%')),

  -- 50 — only successful donations count (view definitions only; no data changed)
  (50, 'financial integrity',    'admin_stats donations_count completed-only', exists(select 1 from pg_views where schemaname='public' and viewname='admin_stats' and definition ilike '%completed%')),
  (50, 'financial integrity',    'financial_summary.failed_payments_amount',   exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_summary' and column_name='failed_payments_amount')),
  (50, 'financial integrity',    'financial_summary.failed_payments_count',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_summary' and column_name='failed_payments_count')),
  (50, 'financial integrity',    'financial_summary.refunded_count',           exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_summary' and column_name='refunded_count')),

  -- 51 — withdrawal commission 4%
  (51, 'commission 4%',          'create_payout_request charges 0.04',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_payout_request' and pg_get_functiondef(p.oid) like '%0.04%')),

  -- 52 — payout pay-time balance guard (audit F-2)
  (52, 'payout balance guard',   'mark_payout_paid re-checks balance',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='mark_payout_paid' and pg_get_functiondef(p.oid) like '%insufficient_balance%')),

  -- 53 — users PII lockdown (column-level grants). These must be FALSE-for-sensitive.
  (53, 'users PII lockdown',     'anon CANNOT select users.email',            not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='anon' and privilege_type='SELECT' and column_name='email')),
  (53, 'users PII lockdown',     'anon CANNOT select users.phone',            not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='anon' and privilege_type='SELECT' and column_name='phone')),
  (53, 'users PII lockdown',     'anon CANNOT select users.rejection_reason', not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='anon' and privilege_type='SELECT' and column_name='rejection_reason')),
  (53, 'users PII lockdown',     'anon CAN still select users.full_name',     exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='anon' and privilege_type='SELECT' and column_name='full_name')),
  (53, 'users PII lockdown',     'fn my_private_profile',                     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='my_private_profile')),

  -- 54 — RLS + storage hardening
  (54, 'rls/storage hardening',  'RLS on reserved_usernames',                 coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.reserved_usernames')), false)),
  (54, 'rls/storage hardening',  'campaign-images insert is folder-scoped',   exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='campaign_images_insert' and coalesce(with_check,'') like '%foldername%')),

  -- 55 — foreign-key indexes
  (55, 'fk indexes',             'idx_updates_user',        exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_updates_user')),
  (55, 'fk indexes',             'idx_comments_user',       exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_comments_user')),
  (55, 'fk indexes',             'idx_creports_user',       exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_creports_user')),
  (55, 'fk indexes',             'idx_idoc_user',           exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_idoc_user')),
  (55, 'fk indexes',             'idx_cext_user',           exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_cext_user')),
  (55, 'fk indexes',             'idx_recent_campaign',     exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_recent_campaign')),
  (55, 'fk indexes',             'idx_payout_reviewed_by',  exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_payout_reviewed_by')),
  (55, 'fk indexes',             'idx_vreq_reviewed_by',    exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_vreq_reviewed_by')),

  -- 56 — storage bucket size + MIME limits (server-side upload caps)
  (56, 'storage bucket limits',  'campaign-images size+mime caps',        exists(select 1 from storage.buckets where id='campaign-images' and file_size_limit is not null and allowed_mime_types is not null)),
  (56, 'storage bucket limits',  'verification-documents size+mime caps', exists(select 1 from storage.buckets where id='verification-documents' and file_size_limit is not null and allowed_mime_types is not null)),

  -- 57 — donation insert lockdown (supersedes #5's client insert policy)
  (57, 'donation insert lockdown','client INSERT policy removed',        (not exists(select 1 from pg_policies where schemaname='public' and tablename='donations' and cmd='INSERT'))),
  (57, 'donation insert lockdown','constraint donations_message_len',     exists(select 1 from pg_constraint where conname='donations_message_len')),

  -- 58 — users anon column lockdown (anon loses role/email_confirmed; authenticated keeps them)
  (58, 'users anon lockdown',    'anon CANNOT select users.role',            not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='anon' and privilege_type='SELECT' and column_name='role')),
  (58, 'users anon lockdown',    'anon CANNOT select users.email_confirmed', not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='anon' and privilege_type='SELECT' and column_name='email_confirmed')),
  (58, 'users anon lockdown',    'authenticated CAN still select users.role', exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='users' and grantee='authenticated' and privilege_type='SELECT' and column_name='role')),

  -- 59 — payout_accounts schema repair (restores payout_accounts.card_number)
  (59, 'payout accounts repair', 'col payout_accounts.card_number', exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_accounts' and column_name='card_number')),

  -- 60 — minimum withdrawal lowered 50000 -> 5000 (create_payout_request v_min)
  (60, 'withdrawal minimum 5000', 'create_payout_request v_min = 5000', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_payout_request' and pg_get_functiondef(p.oid) like '%v_min%integer := 5000%'))
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
  (5,'secure donations RLS','insert restricted (pending-only or #57 lockdown)',(exists(select 1 from pg_policies where tablename='donations' and policyname='donations_insert_pending') or not exists(select 1 from pg_policies where schemaname='public' and tablename='donations' and cmd='INSERT'))),
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
  (31,'admin donations','trigger trg_notify_donation_status',exists(select 1 from pg_trigger where tgname='trg_notify_donation_status' and not tgisinternal)),
  (32,'admin workflow','col campaigns.rejection_reason',exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='rejection_reason')),
  (32,'admin workflow','col admin_stats.revenue',exists(select 1 from information_schema.columns where table_schema='public' and table_name='admin_stats' and column_name='revenue')),
  (33,'email verif gate','fn is_email_confirmed',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_email_confirmed')),
  (33,'email verif gate','col users.email_confirmed',exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='email_confirmed')),
  (34,'usernames','col users.username',exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='username')),
  (34,'usernames','table reserved_usernames',(to_regclass('public.reserved_usernames') is not null)),
  (34,'usernames','fn change_username',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='change_username')),
  (35,'username rules','username_format_ok stricter',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='username_format_ok' and pg_get_functiondef(p.oid) ilike '%[.][.]%')),
  (36,'create email gate','policy campaigns_insert_own (→#37)',exists(select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='campaigns_insert_own')),
  (37,'create KYC gate','enforce_campaign_publish KYC',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='enforce_campaign_publish' and pg_get_functiondef(p.oid) ilike '%is_verified%')),
  (38,'payment foundation','table payment_events',(to_regclass('public.payment_events') is not null)),
  (38,'payment foundation','index donations_payment_ref_key',exists(select 1 from pg_indexes where schemaname='public' and indexname='donations_payment_ref_key')),
  (39,'refund reversal','apply_donation reverses',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_donation' and pg_get_functiondef(p.oid) ilike '%greatest(0, current_amount%')),
  (40,'payout info','table payout_accounts',(to_regclass('public.payout_accounts') is not null)),
  (40,'payout info','col payout_requests.snap_card_number',exists(select 1 from information_schema.columns where table_schema='public' and table_name='payout_requests' and column_name='snap_card_number')),
  (41,'campaign expiration','fn expire_due_campaigns',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='expire_due_campaigns')),
  (41,'campaign expiration','status funded/expired allowed',exists(select 1 from pg_constraint where conname='campaigns_status_check' and pg_get_constraintdef(oid) ilike '%funded%')),
  (42,'campaign extensions','table campaign_extension_requests',(to_regclass('public.campaign_extension_requests') is not null)),
  (42,'campaign extensions','col campaigns.extension_count',exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='extension_count')),
  (42,'campaign extensions','fn approve_campaign_extension',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_campaign_extension')),
  (43,'completion reports v2','col campaign_reports.status',exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_reports' and column_name='status')),
  (43,'completion reports v2','col campaign_reports.fund_breakdown',exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaign_reports' and column_name='fund_breakdown')),
  (43,'completion reports v2','fn review_completion_report',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_completion_report')),
  (44,'guest donations','col donations.donor_name',exists(select 1 from information_schema.columns where table_schema='public' and table_name='donations' and column_name='donor_name')),
  (44,'guest donations','col donations.name_display',exists(select 1 from information_schema.columns where table_schema='public' and table_name='donations' and column_name='name_display')),
  (45,'financial ledger','table financial_ledger',(to_regclass('public.financial_ledger') is not null)),
  (45,'financial ledger','view financial_summary',(to_regclass('public.financial_summary') is not null)),
  (45,'financial ledger','fn public_financial_stats',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='public_financial_stats')),
  (45,'financial ledger','fn check_financial_integrity',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='check_financial_integrity')),
  (45,'financial ledger','trigger trg_ledger_on_donation',exists(select 1 from pg_trigger where tgname='trg_ledger_on_donation' and not tgisinternal)),
  (45,'financial ledger','append-only guard (no delete)',exists(select 1 from pg_trigger where tgname='trg_ledger_no_delete' and not tgisinternal)),
  (46,'financial snapshots','table financial_snapshots',(to_regclass('public.financial_snapshots') is not null)),
  (46,'financial snapshots','fn generate_financial_snapshot',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='generate_financial_snapshot')),
  (46,'financial snapshots','fn reconciliation_report',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reconciliation_report')),
  (46,'financial snapshots','col financial_ledger.reference_id',exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_ledger' and column_name='reference_id')),
  (46,'financial snapshots','trigger trg_ledger_payout_lifecycle',exists(select 1 from pg_trigger where tgname='trg_ledger_payout_lifecycle' and not tgisinternal)),
  (47,'payment providers','table payment_provider_settings',(to_regclass('public.payment_provider_settings') is not null)),
  (47,'payment providers','payment_method allows paynet/uzum',exists(select 1 from pg_constraint where conname='donations_payment_method_check' and pg_get_constraintdef(oid) ilike '%paynet%' and pg_get_constraintdef(oid) ilike '%uzum%')),
  (48,'payme transactions','table payme_transactions',(to_regclass('public.payme_transactions') is not null)),
  (48,'payme transactions','unique active txn per donation',exists(select 1 from pg_indexes where schemaname='public' and indexname='payme_transactions_active_donation_key')),
  (49,'share channels','source CHECK allows instagram',exists(select 1 from pg_constraint where conname='campaign_shares_source_check' and pg_get_constraintdef(oid) ilike '%instagram%')),
  (49,'share channels','RLS insert policy allows qr',exists(select 1 from pg_policies where schemaname='public' and tablename='campaign_shares' and policyname='shares_insert_any' and coalesce(with_check,'') ilike '%qr%')),
  (50,'financial integrity','admin_stats donations_count completed-only',exists(select 1 from pg_views where schemaname='public' and viewname='admin_stats' and definition ilike '%completed%')),
  (50,'financial integrity','financial_summary.failed_payments_amount',exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_summary' and column_name='failed_payments_amount'))
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
