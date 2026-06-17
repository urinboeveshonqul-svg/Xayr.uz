-- ============================================================
-- XAYR — Email-verification gate for campaign creators
-- ============================================================
-- Onboarding is frictionless: anyone can register, browse, donate, save, follow,
-- and edit their profile WITHOUT confirming their email. Email confirmation
-- becomes mandatory only to CREATE / PUBLISH a campaign. This moves the publish
-- gate from KYC identity status to email confirmation (authoritative, server-
-- side). OAuth users (Google/Apple/Facebook) arrive with a confirmed email, so
-- they pass automatically.
--
-- Run in: Supabase Dashboard -> SQL Editor (after verification.sql + google-oauth.sql).
-- Idempotent.
-- ============================================================

-- ── 1. Authoritative helper: is the user's email confirmed? ─────────────────
-- Reads auth.users (the source of truth) — cannot be spoofed from the client.
create or replace function public.is_email_confirmed(uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where id = uid and email_confirmed_at is not null);
$$;

-- ── 2. Mirror onto public.users (for admin filtering + cheap reads) ─────────
alter table public.users add column if not exists email_confirmed boolean not null default false;

update public.users u
   set email_confirmed = true
  from auth.users a
 where a.id = u.id and a.email_confirmed_at is not null;

-- Keep the mirror current as users confirm later.
create or replace function public.sync_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set email_confirmed = (new.email_confirmed_at is not null)
   where id = new.id;
  return new;
end; $$;

drop trigger if exists on_auth_email_confirmed on auth.users;
create trigger on_auth_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_email_confirmed();

-- Seed email_confirmed at signup (OAuth signups arrive pre-confirmed).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, avatar_url, preferred_language, email_confirmed)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'uz'),
    (new.email_confirmed_at is not null)
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- ── 3. Publish gate now keys off email confirmation ─────────────────────────
-- Email-confirmed authors (or admins) may publish (pending/active); everyone
-- else is forced to draft. KYC identity verification remains available + admin-
-- visible but is no longer the publish blocker.
create or replace function public.enforce_campaign_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('pending','active')
       and not (public.is_email_confirmed(new.user_id) or public.is_admin()) then
      new.status := 'draft';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'draft' and new.status <> 'draft'
       and not (public.is_email_confirmed(new.user_id) or public.is_admin()) then
      new.status := 'draft';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_enforce_publish on public.campaigns;
create trigger trg_enforce_publish before insert or update on public.campaigns
  for each row execute function public.enforce_campaign_publish();
