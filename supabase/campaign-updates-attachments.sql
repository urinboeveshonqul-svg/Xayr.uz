-- ============================================================
-- XAYR — Phase 3: Campaign update attachments
-- Adds image + document arrays to campaign_updates (mirrors campaign_reports).
--
-- Files are stored in the EXISTING public 'campaign-reports' bucket under
--   {uid}/{campaignId}/update-*
-- whose policies already enforce own-folder write + public read + owner delete,
-- so NO storage changes are required.
--
-- RLS is unchanged: updates_owner_write (for all) already authorizes the campaign
-- owner to insert / update / delete their update rows.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

alter table public.campaign_updates
  add column if not exists images    text[] not null default '{}',
  add column if not exists documents text[] not null default '{}';
