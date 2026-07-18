-- ============================================================
-- XAYR — Foreign-key indexes (migration #55, audit P2-5)
-- ============================================================
-- PostgreSQL does NOT automatically index foreign-key columns. Every
-- ON DELETE CASCADE / SET NULL must locate the child rows, so an unindexed FK
-- column means a SEQUENTIAL SCAN of the child table per deleted parent row.
-- Deleting one user currently touches five unindexed child tables.
--
-- These are additive only: no existing index is dropped, and none of these
-- duplicates an existing index (verified against every create-index statement in
-- supabase/*.sql — the composite `idx_recent_user (user_id, viewed_at desc)`
-- does not cover recently_viewed.campaign_id, and no index existed on the
-- reviewed_by / user_id columns below).
--
-- ⚠️ RUN THESE ONE STATEMENT AT A TIME.
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block. The
--   Supabase SQL Editor wraps a multi-statement submission in one transaction,
--   which fails with "CREATE INDEX CONCURRENTLY cannot run inside a transaction
--   block". Paste and run each statement individually.
--   CONCURRENTLY is used so no table is write-locked in production.
--
--   If a run is interrupted, Postgres can leave an INVALID index behind. Check:
--     select indexrelid::regclass from pg_index where not indisvalid;
--   and DROP INDEX any invalid one before re-running that statement.
--
-- Idempotent (if not exists). No data is modified.
-- ============================================================

-- users ← cascade children (deleting a user scans these today)
create index concurrently if not exists idx_updates_user
  on public.campaign_updates (user_id);

create index concurrently if not exists idx_comments_user
  on public.comments (user_id);

create index concurrently if not exists idx_creports_user
  on public.campaign_reports (user_id);

create index concurrently if not exists idx_idoc_user
  on public.identity_documents (user_id);

create index concurrently if not exists idx_cext_user
  on public.campaign_extension_requests (user_id);

-- campaigns ← cascade child
create index concurrently if not exists idx_recent_campaign
  on public.recently_viewed (campaign_id);

-- users ← on delete set null (reviewer attribution)
create index concurrently if not exists idx_payout_reviewed_by
  on public.payout_requests (reviewed_by);

create index concurrently if not exists idx_vreq_reviewed_by
  on public.verification_requests (reviewed_by);

-- ============================================================
-- VERIFY (read-only):
--   select indexname from pg_indexes
--    where schemaname='public'
--      and indexname in ('idx_updates_user','idx_comments_user','idx_creports_user',
--                        'idx_idoc_user','idx_cext_user','idx_recent_campaign',
--                        'idx_payout_reviewed_by','idx_vreq_reviewed_by')
--    order by indexname;   -- expect 8 rows
--   select indexrelid::regclass from pg_index where not indisvalid;  -- expect 0 rows
-- ============================================================
