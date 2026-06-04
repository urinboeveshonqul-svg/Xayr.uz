-- ============================================================
-- XAYR — Trust & Verification (KYC) system
-- Run in: Supabase Dashboard → SQL Editor (after the master migration).
-- Safe to re-run.
-- ============================================================

-- ── 1. Users: verification status (server-writable only) ────
alter table public.users
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected'));

-- Re-assert column grants so clients can NEVER write role/verification_status.
revoke update on public.users from anon, authenticated;
grant update (full_name, avatar_url, bio, phone, preferred_language, updated_at)
  on public.users to authenticated;

-- ── 2. Campaigns: add 'draft' (unverified authors can draft only) ──
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft','pending','active','rejected','completed','paused'));

-- ── 3. verification_requests (the KYC application) ──────────
create table if not exists public.verification_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  legal_name       text not null,
  date_of_birth    date not null,
  address          text not null,
  phone            text not null,
  phone_verified   boolean not null default false,
  status           text not null default 'pending'
                     check (status in ('pending','verified','rejected')),
  rejection_reason text,
  reviewed_by      uuid references public.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_vreq_user   on public.verification_requests(user_id);
create index if not exists idx_vreq_status on public.verification_requests(status);

-- ── 4. identity_documents (files live in private storage) ───
create table if not exists public.identity_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.verification_requests(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  doc_type     text not null check (doc_type in ('id_front','id_back','passport','selfie')),
  storage_path text not null,                         -- key in verification-documents bucket
  created_at   timestamptz not null default now()
);
create index if not exists idx_idoc_request on public.identity_documents(request_id);

-- ── 5. phone_otps (server-managed, hashed codes) ───────────
create table if not exists public.phone_otps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  phone      text not null,
  code_hash  text not null,
  verified   boolean not null default false,
  attempts   int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_otp_user on public.phone_otps(user_id);

-- ── 6. Helper: is_verified(uid) ────────────────────────────
create or replace function public.is_verified(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = uid and verification_status = 'verified');
$$;

-- ── 7. Publish gate: only verified authors (or admins) leave 'draft' ──
create or replace function public.enforce_campaign_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only gate a PUBLISH attempt (new campaign, or a transition out of 'draft').
  -- Unrelated updates (e.g. the donation-credit trigger) must not be affected.
  if tg_op = 'INSERT' then
    if new.status in ('pending','active')
       and not (public.is_verified(new.user_id) or public.is_admin()) then
      new.status := 'draft';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'draft' and new.status <> 'draft'
       and not (public.is_verified(new.user_id) or public.is_admin()) then
      new.status := 'draft';   -- unverified author cannot leave draft
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_enforce_publish on public.campaigns;
create trigger trg_enforce_publish before insert or update on public.campaigns
  for each row execute function public.enforce_campaign_publish();

-- ── 8. RLS (writes are service-role only; reads are scoped) ──
alter table public.verification_requests enable row level security;
alter table public.identity_documents    enable row level security;
alter table public.phone_otps            enable row level security;

-- verification_requests: owner + admin may read; admin may update; inserts via service role.
drop policy if exists vreq_select_own_admin on public.verification_requests;
drop policy if exists vreq_admin_update     on public.verification_requests;
create policy vreq_select_own_admin on public.verification_requests for select
  using (user_id = auth.uid() or public.is_admin());
create policy vreq_admin_update on public.verification_requests for update
  using (public.is_admin()) with check (public.is_admin());

-- identity_documents: ADMIN-ONLY read (sensitive); writes via service role.
drop policy if exists idoc_admin_select on public.identity_documents;
create policy idoc_admin_select on public.identity_documents for select
  using (public.is_admin());

-- phone_otps: no client policies → fully service-role only.

-- ── 9. Private storage bucket for ID/selfie documents ───────
insert into storage.buckets (id, name, public)
values ('verification-documents','verification-documents', false)
on conflict (id) do nothing;

drop policy if exists vdoc_insert_own       on storage.objects;
drop policy if exists vdoc_select_own_admin on storage.objects;
-- Upload only into your own folder: {auth.uid}/...
create policy vdoc_insert_own on storage.objects for insert
  with check (
    bucket_id = 'verification-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
-- Read your own folder, or anything if admin. Bucket is PRIVATE (no anon access);
-- the admin UI uses short-lived signed URLs generated with the service role.
create policy vdoc_select_own_admin on storage.objects for select
  using (
    bucket_id = 'verification-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
-- (No update/delete policies → clients cannot modify/remove uploaded documents.)
