-- ============================================================
-- XAYR — Campaign Completion Reports
-- A creator publishes a report after their campaign is 'completed':
-- title + message (+ optional images/documents). Public success stories.
-- Run in: Supabase Dashboard → SQL Editor (after verification.sql). Safe to re-run.
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────
create table if not exists public.campaign_reports (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references public.users(id)     on delete cascade,
  title       text not null,
  message     text not null,
  images      text[] not null default '{}',   -- public URLs / storage paths
  documents   text[] not null default '{}',   -- public URLs / storage paths
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_creports_campaign on public.campaign_reports(campaign_id);

-- ── 2. RLS ──────────────────────────────────────────────────
alter table public.campaign_reports enable row level security;

-- Public can VIEW every report (success stories are public).
drop policy if exists creports_select_all on public.campaign_reports;
create policy creports_select_all on public.campaign_reports for select using (true);

-- Creator may create/edit/delete reports for their OWN campaign.
drop policy if exists creports_owner_write on public.campaign_reports;
create policy creports_owner_write on public.campaign_reports for all
  using (
    user_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

-- Admin may moderate/remove ANY report.
drop policy if exists creports_admin_all on public.campaign_reports;
create policy creports_admin_all on public.campaign_reports for all
  using (public.is_admin()) with check (public.is_admin());

-- Keep updated_at fresh on edit (reuses the standard touch trigger if present).
drop trigger if exists trg_creports_touch on public.campaign_reports;
create trigger trg_creports_touch before update on public.campaign_reports
  for each row execute function public.set_updated_at();

-- ── 3. Public storage bucket for report images/documents ─────
insert into storage.buckets (id, name, public)
values ('campaign-reports','campaign-reports', true)
on conflict (id) do nothing;

-- Upload only into your own folder: {auth.uid}/...
drop policy if exists creport_files_insert_own on storage.objects;
create policy creport_files_insert_own on storage.objects for insert
  with check (
    bucket_id = 'campaign-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Anyone may read (public success-story proof).
drop policy if exists creport_files_select_all on storage.objects;
create policy creport_files_select_all on storage.objects for select
  using (bucket_id = 'campaign-reports');

-- Owner may remove their own files; admin removal handled at the table/service level.
drop policy if exists creport_files_delete_own on storage.objects;
create policy creport_files_delete_own on storage.objects for delete
  using (
    bucket_id = 'campaign-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
