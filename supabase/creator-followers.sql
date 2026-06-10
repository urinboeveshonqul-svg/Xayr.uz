-- ============================================================
-- XAYR — Creator following system
-- Follow/unfollow creators + notify followers when a creator's campaign
-- LAUNCHES (status moves pending/draft -> active). Reuses notifications.
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

create table if not exists public.creator_followers (
  id          uuid        primary key default gen_random_uuid(),
  follower_id uuid        not null references public.users(id) on delete cascade,
  creator_id  uuid        not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (follower_id, creator_id),       -- no duplicate follows
  check (follower_id <> creator_id)       -- no self-following
);

create index if not exists idx_followers_creator  on public.creator_followers (creator_id);
create index if not exists idx_followers_follower on public.creator_followers (follower_id);

alter table public.creator_followers enable row level security;

-- Counts are public; only the follower may create/remove their own follows.
drop policy if exists followers_select_all on public.creator_followers;
drop policy if exists followers_insert_own on public.creator_followers;
drop policy if exists followers_delete_own on public.creator_followers;
create policy followers_select_all on public.creator_followers for select using (true);
create policy followers_insert_own on public.creator_followers for insert
  with check (follower_id = auth.uid() and follower_id <> creator_id);
create policy followers_delete_own on public.creator_followers for delete
  using (follower_id = auth.uid());

-- Notify all followers when a creator's campaign launches. Fires only on the
-- moderation transition (pending/draft -> active), so pausing/unpausing an
-- already-launched campaign does NOT re-notify.
create or replace function public.notify_followers_on_campaign_launch()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status = 'active' and old.status in ('pending', 'draft') then
    select full_name into v_name from public.users where id = new.user_id;
    insert into public.notifications (user_id, type, title, body, link)
    select f.follower_id, 'campaign_status', 'Yangi kampaniya',
           coalesce(v_name, 'Siz kuzatayotgan foydalanuvchi') || ' yangi kampaniya boshladi: ' || new.title,
           '/campaigns/' || new.slug
      from public.creator_followers f
     where f.creator_id = new.user_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_followers_launch on public.campaigns;
create trigger trg_notify_followers_launch
  after update on public.campaigns
  for each row execute function public.notify_followers_on_campaign_launch();
