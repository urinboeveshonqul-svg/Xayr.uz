-- ============================================================
-- XAYR — Contact form messages
-- Anyone (incl. guests) may submit; only admins may read / mark read.
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================

create table if not exists public.contact_messages (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  subject    text,
  message    text        not null,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_unread on public.contact_messages (is_read, created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists cm_insert_any   on public.contact_messages;
drop policy if exists cm_select_admin on public.contact_messages;
drop policy if exists cm_update_admin on public.contact_messages;

create policy cm_insert_any on public.contact_messages for insert with check (true);
create policy cm_select_admin on public.contact_messages for select using (public.is_admin());
create policy cm_update_admin on public.contact_messages for update
  using (public.is_admin()) with check (public.is_admin());
