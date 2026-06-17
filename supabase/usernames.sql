-- ============================================================
-- XAYR — Unique username system
-- ============================================================
-- Every user gets a unique, lowercase username (3–30 chars, [a-z0-9_.]).
-- Usernames power login (email OR username), public profiles (/u/<username>),
-- and creator attribution. Existing users + OAuth signups are auto-assigned one.
--
-- Client UPDATE on users excludes `username` (column-level grants from
-- admin-dashboard.sql), so username changes go only through change_username()
-- (SECURITY DEFINER) — enforcing format, reserved words, uniqueness, 30-day cap.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql + email-verification-gate.sql).
-- Idempotent.
-- ============================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.users add column if not exists username text;
alter table public.users add column if not exists username_changed_at timestamptz;

-- Case-insensitive uniqueness + format guard.
create unique index if not exists users_username_lower_key
  on public.users (lower(username)) where username is not null;
alter table public.users drop constraint if exists users_username_format;
alter table public.users add constraint users_username_format
  check (username is null or username ~ '^[a-z0-9_.]{3,30}$');

-- ── 2. Reserved usernames ───────────────────────────────────────────────────
create table if not exists public.reserved_usernames (name text primary key);
insert into public.reserved_usernames(name) values
  ('admin'),('support'),('xayr'),('api'),('login'),('register'),('campaign'),
  ('campaigns'),('profile'),('settings'),('notifications'),('donate'),('withdraw'),
  ('dashboard'),('system'),('help'),('contact'),('u'),('auth')
on conflict do nothing;

-- ── 3. Validation helpers ───────────────────────────────────────────────────
-- Format only ([a-z0-9_.], 3–30, lowercase). ASCII-only by design, which also
-- blocks Unicode lookalike spoofing.
create or replace function public.username_format_ok(candidate text)
returns boolean language sql immutable as $$
  select candidate is not null
     and candidate = lower(candidate)
     and candidate ~ '^[a-z0-9_.]{3,30}$';
$$;

-- Available = valid format + not reserved + not already taken.
create or replace function public.is_username_available(candidate text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c text := lower(coalesce(candidate, ''));
begin
  if not public.username_format_ok(c) then return false; end if;
  if exists (select 1 from public.reserved_usernames where name = c) then return false; end if;
  if exists (select 1 from public.users where lower(username) = c) then return false; end if;
  return true;
end; $$;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Derive a free, valid username from any seed (full name / email prefix / …).
-- Always returns a usable, unique value (never raises) so it can't break signup.
create or replace function public.generate_username(seed text)
returns text language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := regexp_replace(lower(coalesce(seed, '')), '[^a-z0-9_.]', '', 'g');
  base := substr(base, 1, 24);
  if length(base) < 3 then base := 'user' || base; end if;
  base := substr(base, 1, 24);
  candidate := base;
  while exists (select 1 from public.reserved_usernames where name = candidate)
     or exists (select 1 from public.users where lower(username) = candidate) loop
    n := n + 1;
    candidate := substr(base, 1, 24) || n::text;
  end loop;
  return candidate;
end; $$;

-- ── 4. Change username (RPC) — format + reserved + unique + 30-day cap ──────
create or replace function public.change_username(new_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := lower(coalesce(new_name, ''));
  current_un text;
  last_changed timestamptz;
begin
  if uid is null then raise exception 'auth_required'; end if;
  select username, username_changed_at into current_un, last_changed
    from public.users where id = uid;
  if c = lower(coalesce(current_un, '')) then return current_un; end if;       -- no-op
  if not public.username_format_ok(c) then raise exception 'invalid_username'; end if;
  if exists (select 1 from public.reserved_usernames where name = c) then raise exception 'reserved_username'; end if;
  if exists (select 1 from public.users where lower(username) = c and id <> uid) then raise exception 'username_taken'; end if;
  if last_changed is not null and last_changed > now() - interval '30 days' then
    raise exception 'username_change_too_soon';
  end if;
  update public.users set username = c, username_changed_at = now() where id = uid;
  return c;
end; $$;
grant execute on function public.change_username(text) to authenticated;

-- ── 5. Backfill existing accounts ───────────────────────────────────────────
-- Priority: full_name → email prefix → 'user'. generate_username guarantees a
-- unique result. Never overwrites an existing (manually chosen) username.
do $$
declare r record;
begin
  for r in select id, full_name, email from public.users where username is null loop
    update public.users
       set username = public.generate_username(
             coalesce(nullif(btrim(r.full_name), ''), split_part(r.email, '@', 1), 'user'))
     where id = r.id;
  end loop;
end $$;

-- ── 6. Auto-assign on signup (email/password + OAuth) ───────────────────────
-- Redefinition of handle_new_user keeping every prior field (email_confirmed,
-- name/avatar coalesce, preferred_language) and adding the username.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, avatar_url, preferred_language, email_confirmed, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'uz'),
    (new.email_confirmed_at is not null),
    public.generate_username(coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'user'))
  )
  on conflict (id) do nothing;
  return new;
end; $$;
