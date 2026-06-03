-- ============================================================
-- Adds an array of additional image URLs to campaigns.
-- `image_url` stays the single cover image; `images` holds the gallery.
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================
alter table public.campaigns
  add column if not exists images text[] not null default '{}';
