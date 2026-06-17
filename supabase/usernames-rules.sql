-- ============================================================
-- XAYR — Username rule hardening
-- ============================================================
-- Tightens server-side username validation to match the client: rejects
-- leading/trailing periods and consecutive periods/underscores, and makes
-- generate_username() never emit them. Used by is_username_available() and
-- change_username() (which call username_format_ok). No schema changes.
--
-- Run in: Supabase Dashboard -> SQL Editor (after usernames.sql). Idempotent.
-- ============================================================

create or replace function public.username_format_ok(candidate text)
returns boolean language sql immutable as $$
  select candidate is not null
     and candidate = lower(candidate)
     and candidate ~ '^[a-z0-9_.]{3,30}$'
     and candidate !~ '^[.]'      -- no leading period
     and candidate !~ '[.]$'      -- no trailing period
     and candidate !~ '[.][.]'    -- no consecutive periods
     and candidate !~ '__';       -- no consecutive underscores
$$;

-- Generator: collapse repeats + trim periods so produced names are always valid.
create or replace function public.generate_username(seed text)
returns text language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := regexp_replace(lower(coalesce(seed, '')), '[^a-z0-9_.]', '', 'g');
  base := regexp_replace(base, '[.]{2,}', '.', 'g');   -- collapse dots
  base := regexp_replace(base, '_{2,}', '_', 'g');     -- collapse underscores
  base := btrim(base, '.');                            -- trim leading/trailing dots
  base := substr(base, 1, 24);
  if length(base) < 3 then base := 'user' || base; end if;
  base := btrim(substr(base, 1, 24), '.');
  if length(base) < 3 then base := 'user'; end if;
  candidate := base;
  while exists (select 1 from public.reserved_usernames where name = candidate)
     or exists (select 1 from public.users where lower(username) = candidate) loop
    n := n + 1;
    candidate := substr(base, 1, 24) || n::text;
  end loop;
  return candidate;
end; $$;
