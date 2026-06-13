-- ============================================================
-- XAYR — Crowdfunding Platform — COMPLETE SUPABASE SCHEMA
-- Run once in: Supabase Dashboard → SQL Editor → "New query" → Run
-- Target: PostgreSQL 15 / Supabase
--
-- Strict execution order (so a fresh empty project runs clean):
--   1. Extensions
--   2. Tables          (created before anything references them)
--   3. Indexes
--   4. Functions       (created AFTER the tables they reference exist)
--   5. Triggers
--   6. RLS + Policies
--   7. Storage
--   8. Seed data
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;        -- gen_random_uuid()


-- ============================================================
-- 2. TABLES   (order respects foreign-key dependencies)
-- ============================================================

-- 2.1 USERS  (public profile, 1:1 with auth.users) ----------
create table if not exists public.users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text unique,
  full_name          text,
  avatar_url         text,
  preferred_language text not null default 'uz'
                       check (preferred_language in ('uz','ru','en')),
  role               text not null default 'user'
                       check (role in ('user','admin')),
  bio                text,
  phone              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 2.2 CATEGORIES --------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name_uz    text not null,
  name_ru    text not null,
  name_en    text not null,
  icon       text,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

-- 2.3 CAMPAIGNS ---------------------------------------------
create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete set null,
  title          text not null,
  slug           text unique not null,
  description    text not null,
  story          text,
  goal_amount    bigint not null check (goal_amount > 0),
  current_amount bigint not null default 0 check (current_amount >= 0),
  image_url      text,
  images         text[] not null default '{}',
  status         text not null default 'pending'
                   check (status in ('pending','active','rejected','completed','paused')),
  is_urgent      boolean not null default false,
  deadline       date,
  location       text,
  donors_count   int not null default 0,
  views          int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2.4 DONATIONS ---------------------------------------------
create table if not exists public.donations (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  donor_id       uuid references public.users (id) on delete set null,  -- null = guest
  amount         bigint not null check (amount > 0),
  anonymous      boolean not null default false,
  message        text,
  status         text not null default 'pending'
                   check (status in ('pending','completed','failed','refunded')),
  payment_method text check (payment_method in ('click','payme','uzcard','humo','cash')),
  payment_ref    text,
  created_at     timestamptz not null default now()
);

-- 2.5 CAMPAIGN_UPDATES --------------------------------------
create table if not exists public.campaign_updates (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  title       text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);

-- 2.6 COMMENTS  (threaded via parent_id) --------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  parent_id   uuid references public.comments (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2.7 NOTIFICATIONS -----------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       text not null default 'general'
               check (type in ('general','donation','comment','campaign_status','update')),
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2.8 SAVED_CAMPAIGNS  (bookmarks) --------------------------
create table if not exists public.saved_campaigns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, campaign_id)
);


-- ============================================================
-- 3. INDEXES
-- ============================================================
create index if not exists idx_campaigns_user        on public.campaigns (user_id);
create index if not exists idx_campaigns_category     on public.campaigns (category_id);
create index if not exists idx_campaigns_status       on public.campaigns (status);
create index if not exists idx_campaigns_created      on public.campaigns (created_at desc);
create index if not exists idx_campaigns_slug         on public.campaigns (slug);

create index if not exists idx_donations_campaign     on public.donations (campaign_id);
create index if not exists idx_donations_donor        on public.donations (donor_id);
create index if not exists idx_donations_status       on public.donations (status);

create index if not exists idx_updates_campaign       on public.campaign_updates (campaign_id);

create index if not exists idx_comments_campaign      on public.comments (campaign_id);
create index if not exists idx_comments_parent        on public.comments (parent_id);

create index if not exists idx_notifications_user     on public.notifications (user_id);
create index if not exists idx_notifications_unread   on public.notifications (user_id) where is_read = false;

create index if not exists idx_saved_user             on public.saved_campaigns (user_id);
create index if not exists idx_saved_campaign         on public.saved_campaigns (campaign_id);


-- ============================================================
-- 4. FUNCTIONS   (created AFTER all referenced tables exist)
-- ============================================================

-- 4.1 is_admin() — SECURITY DEFINER avoids recursive RLS.
--     `language sql` bodies are validated at creation time, so
--     public.users MUST already exist (it does, from section 2).
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

-- 4.2 keep updated_at fresh ---------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- 4.3 auto-create the public profile on auth signup ---------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- full_name/avatar_url: email signups set these explicitly; Google OAuth may
  -- send name/picture instead, so coalesce across both shapes.
  insert into public.users (id, email, full_name, avatar_url, preferred_language)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'uz')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- 4.4 credit a campaign + notify owner on completed donation -
create or replace function public.apply_donation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from 'completed') then

    -- Opt into the protected-field guard bypass: apply_donation runs as the
    -- donor (auth.uid() is null for the service role that completes a payment),
    -- so is_admin() is false. The flag is transaction-local and cleared after.
    perform set_config('app.guard_campaign_bypass', 'on', true);
    update public.campaigns
       set current_amount = current_amount + new.amount,
           donors_count   = donors_count + 1
     where id = new.campaign_id;
    perform set_config('app.guard_campaign_bypass', 'off', true);

    insert into public.notifications (user_id, type, title, body, link)
    select c.user_id, 'donation', 'Yangi xayriya',
           'Kampaniyangizga yangi xayriya tushdi.', '/campaigns/' || c.slug
      from public.campaigns c
     where c.id = new.campaign_id;
  end if;
  return new;
end; $$;

-- 4.5 notify the campaign owner on a new comment ------------
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
  c_slug   text;
begin
  select user_id, slug into owner_id, c_slug
    from public.campaigns where id = new.campaign_id;

  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications (user_id, type, title, body, link)
    values (owner_id, 'comment', 'Yangi izoh',
            'Kampaniyangizga yangi izoh qoldirildi.', '/campaigns/' || c_slug);
  end if;
  return new;
end; $$;

-- 4.6 guard protected campaign fields ------------------------
--     RLS gates which ROWS an owner may update, but not which COLUMNS. This
--     trigger makes status / current_amount / donors_count / views writable
--     only by admins (or the donation-credit path via the bypass flag); a
--     campaign owner editing their campaign cannot fabricate totals.
create or replace function public.guard_campaign_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin()
     or current_setting('app.guard_campaign_bypass', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.current_amount := 0;
    new.donors_count   := 0;
    new.views          := 0;
    if new.status is null or new.status not in ('draft', 'pending') then
      new.status := 'pending';
    end if;
  elsif tg_op = 'UPDATE' then
    new.status         := old.status;
    new.current_amount := old.current_amount;
    new.donors_count   := old.donors_count;
    new.views          := old.views;
  end if;
  return new;
end; $$;


-- ============================================================
-- 5. TRIGGERS   (created AFTER their functions + tables exist)
-- ============================================================
drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated     before update on public.users     for each row execute function public.set_updated_at();

drop trigger if exists trg_campaigns_updated on public.campaigns;
create trigger trg_campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();

-- Name sorts before trg_campaigns_updated so the guard fires first.
drop trigger if exists trg_campaign_field_guard on public.campaigns;
create trigger trg_campaign_field_guard before insert or update on public.campaigns
  for each row execute function public.guard_campaign_protected_fields();

drop trigger if exists trg_comments_updated on public.comments;
create trigger trg_comments_updated  before update on public.comments  for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_apply_donation on public.donations;
create trigger trg_apply_donation
  after insert or update on public.donations
  for each row execute function public.apply_donation();

drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();


-- ============================================================
-- 6. ROW LEVEL SECURITY  (enable, then policies)
-- ============================================================
alter table public.users            enable row level security;
alter table public.categories       enable row level security;
alter table public.campaigns        enable row level security;
alter table public.donations        enable row level security;
alter table public.campaign_updates enable row level security;
alter table public.comments         enable row level security;
alter table public.notifications    enable row level security;
alter table public.saved_campaigns  enable row level security;

-- ── USERS ──────────────────────────────────────────────────
drop policy if exists users_select_all  on public.users;
drop policy if exists users_insert_self on public.users;
drop policy if exists users_update_self on public.users;
create policy users_select_all  on public.users for select using (true);
create policy users_insert_self on public.users for insert with check (auth.uid() = id);
create policy users_update_self on public.users for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── CATEGORIES ─────────────────────────────────────────────
drop policy if exists categories_select_all on public.categories;
drop policy if exists categories_admin_write on public.categories;
create policy categories_select_all on public.categories for select using (true);
create policy categories_admin_write on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ── CAMPAIGNS ──────────────────────────────────────────────
drop policy if exists campaigns_select_public on public.campaigns;
drop policy if exists campaigns_insert_own    on public.campaigns;
drop policy if exists campaigns_update_own     on public.campaigns;
drop policy if exists campaigns_delete_own     on public.campaigns;
create policy campaigns_select_public on public.campaigns for select
  using (status = 'active' or user_id = auth.uid() or public.is_admin());
create policy campaigns_insert_own on public.campaigns for insert
  with check (user_id = auth.uid());
-- Row-level ownership gate only. Column-level protection (owners cannot write
-- status / current_amount / donors_count / views) is enforced by the
-- guard_campaign_protected_fields() trigger, because RLS cannot restrict columns.
create policy campaigns_update_own on public.campaigns for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy campaigns_delete_own on public.campaigns for delete
  using (user_id = auth.uid() or public.is_admin());

-- ── DONATIONS ──────────────────────────────────────────────
-- Anyone can record a donation (guests included). Reads limited to the
-- donor, the campaign owner, and admins.
drop policy if exists donations_insert_any    on public.donations;
drop policy if exists donations_select_scoped on public.donations;
create policy donations_insert_any on public.donations for insert with check (true);
create policy donations_select_scoped on public.donations for select using (
  donor_id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);

-- ── CAMPAIGN_UPDATES ───────────────────────────────────────
drop policy if exists updates_select_all  on public.campaign_updates;
drop policy if exists updates_owner_write on public.campaign_updates;
create policy updates_select_all on public.campaign_updates for select using (true);
create policy updates_owner_write on public.campaign_updates for all
  using  (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

-- ── COMMENTS ───────────────────────────────────────────────
drop policy if exists comments_select_all         on public.comments;
drop policy if exists comments_insert_own          on public.comments;
drop policy if exists comments_update_own          on public.comments;
drop policy if exists comments_delete_own_or_admin on public.comments;
create policy comments_select_all on public.comments for select using (true);
create policy comments_insert_own on public.comments for insert with check (user_id = auth.uid());
create policy comments_update_own on public.comments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete_own_or_admin on public.comments for delete using (user_id = auth.uid() or public.is_admin());

-- ── NOTIFICATIONS ──────────────────────────────────────────
-- Rows are created by SECURITY DEFINER triggers / service role (both
-- bypass RLS). Users may only read / update / delete their own.
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_select_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete using (user_id = auth.uid());

-- ── SAVED_CAMPAIGNS ────────────────────────────────────────
drop policy if exists saved_select_own on public.saved_campaigns;
drop policy if exists saved_insert_own on public.saved_campaigns;
drop policy if exists saved_delete_own on public.saved_campaigns;
create policy saved_select_own on public.saved_campaigns for select using (user_id = auth.uid());
create policy saved_insert_own on public.saved_campaigns for insert with check (user_id = auth.uid());
create policy saved_delete_own on public.saved_campaigns for delete using (user_id = auth.uid());


-- ============================================================
-- 7. STORAGE  (campaign images bucket)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do nothing;

drop policy if exists campaign_images_read       on storage.objects;
drop policy if exists campaign_images_insert     on storage.objects;
drop policy if exists campaign_images_update_own on storage.objects;
drop policy if exists campaign_images_delete_own on storage.objects;
create policy campaign_images_read on storage.objects for select
  using (bucket_id = 'campaign-images');
create policy campaign_images_insert on storage.objects for insert
  with check (bucket_id = 'campaign-images' and auth.uid() is not null);
create policy campaign_images_update_own on storage.objects for update
  using (bucket_id = 'campaign-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy campaign_images_delete_own on storage.objects for delete
  using (bucket_id = 'campaign-images' and auth.uid()::text = (storage.foldername(name))[1]);


-- ============================================================
-- 8. SEED: categories (3-language labels)
-- ============================================================
insert into public.categories (slug, name_uz, name_ru, name_en, icon, sort_order) values
  ('medical',     'Tibbiyot',   'Медицина',     'Medical',     '🏥', 1),
  ('education',   'Ta''lim',     'Образование',  'Education',   '📚', 2),
  ('disaster',    'Favqulodda', 'Чрезвычайные', 'Emergency',   '🆘', 3),
  ('community',   'Jamiyat',    'Сообщество',   'Community',   '🤝', 4),
  ('environment', 'Ekologiya',  'Экология',     'Environment', '🌱', 5),
  ('animal',      'Hayvonlar',  'Животные',     'Animals',     '🐾', 6),
  ('sport',       'Sport',      'Спорт',        'Sports',      '⚽', 7),
  ('other',       'Boshqa',     'Другое',       'Other',       '💡', 8)
on conflict (slug) do nothing;

-- ============================================================
-- DONE. Grant yourself admin after signing up:
--   update public.users set role = 'admin' where email = 'you@example.com';
-- ============================================================
