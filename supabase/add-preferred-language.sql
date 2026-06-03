-- ============================================================
-- Adds a per-user preferred language to public.users
-- (the table that stores user profiles in the current schema).
--
-- NOTE: If you already ran supabase/schema.sql, the `users` table
-- ALREADY includes preferred_language and this migration is a no-op.
-- It is safe to run regardless — it only adds the column if missing.
--
-- Run in: Supabase Dashboard → SQL Editor.
-- ============================================================

alter table public.users
  add column if not exists preferred_language text not null default 'uz';

-- Add the language check constraint only if it isn't already present.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_preferred_language_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_preferred_language_check
      check (preferred_language in ('uz', 'ru', 'en'));
  end if;
end $$;
