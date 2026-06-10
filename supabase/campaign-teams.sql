-- ============================================================
-- XAYR — Team Campaigns
-- Adds campaign_team_members (owner / manager / editor) with strict RLS:
--   owner    -> full control (campaign row, team, updates, reports)
--   manager  -> updates + reports + campaign management (edit campaign row)
--   editor   -> updates only
-- The 'owner' row is created/maintained ONLY by triggers (mirrors
-- campaigns.user_id); clients can never insert/update/delete an owner row,
-- which prevents both owner removal and privilege escalation.
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────
create table if not exists public.campaign_team_members (
  id          uuid        primary key default gen_random_uuid(),
  campaign_id uuid        not null references public.campaigns(id) on delete cascade,
  user_id     uuid        not null references public.users(id)     on delete cascade,
  role        text        not null check (role in ('owner','manager','editor')),
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index if not exists idx_team_campaign on public.campaign_team_members (campaign_id);
create index if not exists idx_team_user     on public.campaign_team_members (user_id);

-- ── 2. Role helper (used by RLS; SECURITY DEFINER avoids recursion) ──
create or replace function public.campaign_role(p_campaign_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select role from public.campaign_team_members
   where campaign_id = p_campaign_id and user_id = auth.uid();
$$;
grant execute on function public.campaign_role(uuid) to anon, authenticated;

-- ── 3. Owner row lifecycle (trigger-managed, never client-managed) ──
-- 3.1 auto-create the owner membership when a campaign is created
create or replace function public.add_campaign_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.campaign_team_members (campaign_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (campaign_id, user_id) do update set role = 'owner';
  return new;
end; $$;

drop trigger if exists trg_campaign_owner_member on public.campaigns;
create trigger trg_campaign_owner_member
  after insert on public.campaigns
  for each row execute function public.add_campaign_owner_member();

-- 3.2 backfill owner rows for existing campaigns
insert into public.campaign_team_members (campaign_id, user_id, role)
select id, user_id, 'owner' from public.campaigns
on conflict (campaign_id, user_id) do update set role = 'owner';

-- 3.3 keep the owner row in sync if an ADMIN transfers campaign ownership
create or replace function public.sync_campaign_team_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then
    delete from public.campaign_team_members
     where campaign_id = new.id and role = 'owner';
    insert into public.campaign_team_members (campaign_id, user_id, role)
    values (new.id, new.user_id, 'owner')
    on conflict (campaign_id, user_id) do update set role = 'owner';
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_team_owner on public.campaigns;
create trigger trg_sync_team_owner
  after update on public.campaigns
  for each row execute function public.sync_campaign_team_owner();

-- 3.4 anti-escalation: only ADMINS may change campaigns.user_id. Without this,
-- a manager (who can update the campaign row) could reassign ownership to
-- themselves. Non-admin attempts are silently reverted.
create or replace function public.guard_campaign_owner_column()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id and not public.is_admin() then
    new.user_id := old.user_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_campaign_owner_guard on public.campaigns;
create trigger trg_campaign_owner_guard
  before update on public.campaigns
  for each row execute function public.guard_campaign_owner_column();

-- ── 4. Team RLS ─────────────────────────────────────────────
alter table public.campaign_team_members enable row level security;

drop policy if exists team_select_all   on public.campaign_team_members;
drop policy if exists team_insert_owner on public.campaign_team_members;
drop policy if exists team_update_owner on public.campaign_team_members;
drop policy if exists team_delete_owner on public.campaign_team_members;

-- Team rosters are shown publicly on campaign pages.
create policy team_select_all on public.campaign_team_members for select using (true);

-- Only the campaign owner (or admin) may add members, and NEVER as 'owner'.
create policy team_insert_owner on public.campaign_team_members for insert
  with check (
    role in ('manager','editor')
    and (
      exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
      or public.is_admin()
    )
  );

-- Owner (or admin) may change member roles, but owner rows are untouchable
-- and nobody can promote a member to 'owner'.
create policy team_update_owner on public.campaign_team_members for update
  using (
    role <> 'owner'
    and (
      exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
      or public.is_admin()
    )
  )
  with check (
    role in ('manager','editor')
    and (
      exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
      or public.is_admin()
    )
  );

-- Owner (or admin) may remove members — but never the owner row.
create policy team_delete_owner on public.campaign_team_members for delete
  using (
    role <> 'owner'
    and (
      exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
      or public.is_admin()
    )
  );

-- ── 5. Team-aware permissions on existing tables ────────────
-- 5.1 campaign_updates: ANY team member (owner/manager/editor) may write.
--     (Direct-ownership fallback kept so nothing regresses if an owner row
--     is ever missing.)
drop policy if exists updates_owner_write on public.campaign_updates;
drop policy if exists updates_team_write  on public.campaign_updates;
create policy updates_team_write on public.campaign_updates for all
  using (
    public.campaign_role(campaign_id) is not null
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    or public.is_admin()
  )
  with check (
    public.campaign_role(campaign_id) is not null
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    or public.is_admin()
  );

-- 5.2 campaign_reports: owner + manager only (editors excluded).
--     Insert requires self-authorship; update/delete allowed for owner/manager.
--     The existing creports_select_all and creports_admin_all policies stay.
drop policy if exists creports_owner_write  on public.campaign_reports;
drop policy if exists creports_team_insert  on public.campaign_reports;
drop policy if exists creports_team_update  on public.campaign_reports;
drop policy if exists creports_team_delete  on public.campaign_reports;

create policy creports_team_insert on public.campaign_reports for insert
  with check (
    user_id = auth.uid()
    and (
      public.campaign_role(campaign_id) in ('owner','manager')
      or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    )
  );

create policy creports_team_update on public.campaign_reports for update
  using (
    public.campaign_role(campaign_id) in ('owner','manager')
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  )
  with check (
    public.campaign_role(campaign_id) in ('owner','manager')
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

create policy creports_team_delete on public.campaign_reports for delete
  using (
    public.campaign_role(campaign_id) in ('owner','manager')
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

-- 5.3 campaigns: managers may edit the campaign row ("campaign management").
--     Protected columns (status/current_amount/donors_count/views) stay
--     admin-only via guard_campaign_protected_fields; user_id stays admin-only
--     via guard_campaign_owner_column (3.4). Delete remains owner/admin-only.
drop policy if exists campaigns_update_own on public.campaigns;
create policy campaigns_update_own on public.campaigns for update
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.campaign_role(id) in ('owner','manager')
  )
  with check (
    user_id = auth.uid()
    or public.is_admin()
    or public.campaign_role(id) in ('owner','manager')
  );
