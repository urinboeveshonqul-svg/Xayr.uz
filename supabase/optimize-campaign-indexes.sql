-- ============================================================
-- Indexes that optimize the campaign listing page queries.
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================

-- The listing always filters status = 'active' and sorts by one of:
--   created_at (newest), current_amount (most raised), donors_count (most donors).
-- Partial indexes keep them small and perfectly ordered.
create index if not exists idx_campaigns_active_new
  on public.campaigns (created_at desc) where status = 'active';

create index if not exists idx_campaigns_active_raised
  on public.campaigns (current_amount desc) where status = 'active';

create index if not exists idx_campaigns_active_donors
  on public.campaigns (donors_count desc) where status = 'active';

-- Case-insensitive substring search (ILIKE '%term%') on title/description.
-- Trigram GIN indexes turn these into index scans instead of full scans.
create extension if not exists pg_trgm;

create index if not exists idx_campaigns_title_trgm
  on public.campaigns using gin (title gin_trgm_ops);

create index if not exists idx_campaigns_description_trgm
  on public.campaigns using gin (description gin_trgm_ops);
