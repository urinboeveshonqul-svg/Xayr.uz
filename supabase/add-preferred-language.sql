-- ============================================================
-- Adds a per-user preferred language to profiles.
-- Run this in the Supabase SQL editor.
-- ============================================================
alter table public.profiles
  add column if not exists preferred_language text not null default 'uz'
  check (preferred_language in ('uz', 'ru', 'en'));
