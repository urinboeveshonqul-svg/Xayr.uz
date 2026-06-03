-- ============================================================
-- XAYR PLATFORM — Supabase Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── PROFILES ───────────────────────────────────────────────
create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  full_name   text,
  avatar_url  text,
  bio         text,
  phone       text,
  role        text not null default 'user' check (role in ('user','admin')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── CAMPAIGNS ──────────────────────────────────────────────
create table public.campaigns (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  title         text not null,
  slug          text unique not null,
  description   text not null,
  story         text,
  category      text not null check (category in ('medical','education','disaster','community','environment','animal','sport','other')),
  goal          bigint not null check (goal > 0),
  raised        bigint not null default 0,
  image_url     text,
  status        text not null default 'pending' check (status in ('pending','active','rejected','completed','paused')),
  is_urgent     boolean default false,
  deadline      date,
  organizer     text,
  location      text,
  donors_count  int default 0,
  views         int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.campaigns enable row level security;
create policy "Active campaigns viewable by all"   on public.campaigns for select using (status = 'active' or auth.uid() = user_id);
create policy "Users can create campaigns"         on public.campaigns for insert with check (auth.uid() = user_id);
create policy "Users can update own campaigns"     on public.campaigns for update using (auth.uid() = user_id);
create policy "Admins can do everything"           on public.campaigns for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ─── DONATIONS ──────────────────────────────────────────────
create table public.donations (
  id            uuid default uuid_generate_v4() primary key,
  campaign_id   uuid references public.campaigns(id) on delete cascade not null,
  user_id       uuid references public.profiles(id) on delete set null,
  amount        bigint not null check (amount > 0),
  message       text,
  is_anonymous  boolean default false,
  donor_name    text,
  payment_method text check (payment_method in ('click','payme','uzcard','humo','cash')),
  payment_id    text,
  status        text default 'pending' check (status in ('pending','completed','failed','refunded')),
  created_at    timestamptz default now()
);
alter table public.donations enable row level security;
create policy "Donations viewable by campaign owner and donor" on public.donations for select
  using (auth.uid() = user_id or exists (select 1 from public.campaigns where id = campaign_id and user_id = auth.uid()));
create policy "Anyone can create donation" on public.donations for insert with check (true);
create policy "Admins can view all donations" on public.donations for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Auto-update campaign raised amount and donor count
create or replace function public.update_campaign_on_donation()
returns trigger language plpgsql security definer as $$
begin
  if NEW.status = 'completed' then
    update public.campaigns
    set raised = raised + NEW.amount,
        donors_count = donors_count + 1,
        updated_at = now()
    where id = NEW.campaign_id;
  end if;
  return NEW;
end;
$$;
create trigger on_donation_completed
  after insert or update on public.donations
  for each row execute procedure public.update_campaign_on_donation();

-- ─── CAMPAIGN UPDATES ───────────────────────────────────────
create table public.campaign_updates (
  id          uuid default uuid_generate_v4() primary key,
  campaign_id uuid references public.campaigns(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  title       text not null,
  content     text not null,
  created_at  timestamptz default now()
);
alter table public.campaign_updates enable row level security;
create policy "Updates viewable by all" on public.campaign_updates for select using (true);
create policy "Campaign owner can post updates" on public.campaign_updates for insert
  with check (exists (select 1 from public.campaigns where id = campaign_id and user_id = auth.uid()));

-- ─── STORAGE BUCKET ─────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('campaign-images', 'campaign-images', true);
create policy "Anyone can view campaign images" on storage.objects for select using (bucket_id = 'campaign-images');
create policy "Auth users can upload images" on storage.objects for insert
  with check (bucket_id = 'campaign-images' and auth.role() = 'authenticated');
create policy "Users can update own images" on storage.objects for update
  using (bucket_id = 'campaign-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- ─── INDEXES ────────────────────────────────────────────────
create index campaigns_status_idx    on public.campaigns(status);
create index campaigns_category_idx  on public.campaigns(category);
create index campaigns_user_id_idx   on public.campaigns(user_id);
create index donations_campaign_idx  on public.donations(campaign_id);
create index donations_user_idx      on public.donations(user_id);
