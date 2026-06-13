-- ============================================================
-- XAYR — Push notification preferences
-- ============================================================
-- Backs browser push (OneSignal). Each in-app notification already lands in
-- public.notifications via triggers; a Supabase Database Webhook on INSERT calls
-- /api/push/notify, which reads this table to decide whether to ALSO send a push.
--
-- push_enabled is the master switch and defaults FALSE — no push is sent until
-- the user explicitly opts in (grants browser permission). Transactional
-- categories default ON once enabled; marketing is opt-in only. A user with no
-- row here therefore receives NO push (correct: they never opted in), while
-- still getting every in-app notification (the DB row is the fallback).
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Idempotent.
-- ============================================================

create table if not exists public.notification_preferences (
  user_id          uuid        primary key references public.users(id) on delete cascade,
  push_enabled     boolean     not null default false,  -- master switch (opt-in)
  donations        boolean     not null default true,   -- new donation, goal reached
  campaign_updates boolean     not null default true,   -- status, updates, reports, payouts
  verification     boolean     not null default true,   -- verification approved/rejected
  marketing        boolean     not null default false,  -- promotional (opt-in only)
  updated_at       timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

-- Each user manages only their own preferences. The push webhook reads this
-- table with the service role (RLS bypassed), so no service policy is needed.
drop policy if exists np_select_own on public.notification_preferences;
drop policy if exists np_insert_own on public.notification_preferences;
drop policy if exists np_update_own on public.notification_preferences;
create policy np_select_own on public.notification_preferences
  for select using (user_id = auth.uid());
create policy np_insert_own on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy np_update_own on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- keep updated_at fresh (reuses the shared trigger fn from schema.sql)
drop trigger if exists trg_np_updated on public.notification_preferences;
create trigger trg_np_updated
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
