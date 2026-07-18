-- ============================================================
-- XAYR — RLS + storage hardening (migration #54, audit P2-3 / P2-4)
-- ============================================================
-- Two independent, surgical fixes. No data is modified.
--
-- P2-3  reserved_usernames had NO RLS. In Supabase, a public-schema table
--       without RLS is reachable through PostgREST by anon/authenticated, so the
--       reserved list was writable: DELETE 'admin' then register the username
--       'admin' (→ /u/admin) is a credible impersonation/phishing path, and
--       INSERT lets an attacker deny legitimate names.
--
--       Reads are unaffected either way: is_username_available() /
--       generate_username() are SECURITY DEFINER, so they read the table as their
--       owner regardless of RLS. Enabling RLS with NO permissive policy for
--       anon/authenticated therefore blocks all client access while every
--       username check keeps working. The service role bypasses RLS, so admin
--       tooling can still curate the list.
--
-- P2-4  campaign-images allowed ANY authenticated user to INSERT at ANY path,
--       unlike profile-photos / campaign-reports / verification-documents which
--       all pin the first path segment to auth.uid(). Aligns it with them.
--       READ permissions are deliberately NOT changed (bucket stays public-read),
--       and update/delete were already own-folder scoped.
--
-- Run in: Supabase Dashboard -> SQL Editor. Idempotent.
-- ============================================================

-- ── P2-3. reserved_usernames: lock down client access ───────────────────────
alter table public.reserved_usernames enable row level security;

-- Deliberately NO policy for anon/authenticated: with RLS on and no permissive
-- policy, PostgREST returns nothing and every write is rejected. The SECURITY
-- DEFINER username functions and the service role are unaffected.
-- An explicit admin-manage policy keeps the list curatable from an admin session.
drop policy if exists reserved_usernames_admin_manage on public.reserved_usernames;
create policy reserved_usernames_admin_manage on public.reserved_usernames
  for all using (public.is_admin()) with check (public.is_admin());

-- ── P2-4. campaign-images: restrict INSERT to the uploader's own folder ─────
-- Matches profile-photos / campaign-reports / verification-documents exactly.
-- (Read policy untouched — the bucket remains publicly readable.)
drop policy if exists campaign_images_insert on storage.objects;
create policy campaign_images_insert on storage.objects for insert
  with check (
    bucket_id = 'campaign-images'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- VERIFY (read-only):
--   select relrowsecurity from pg_class where oid = 'public.reserved_usernames'::regclass;  -- t
--   select public.is_username_available('admin');   -- still false (definer read works)
--   select policyname, with_check from pg_policies
--    where schemaname='storage' and tablename='objects' and policyname='campaign_images_insert';
--   -- with_check must now contain storage.foldername(name))[1]
-- ============================================================
