-- ============================================================
-- XAYR — Profile photos storage
-- Public 'profile-photos' bucket; each user may write ONLY inside their own
-- folder ({auth.uid}/...), everyone may read (avatars are public). The DB
-- column users.avatar_url already exists — no table changes.
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Own-folder write (insert + update covers upsert overwrites).
drop policy if exists avatar_insert_own on storage.objects;
create policy avatar_insert_own on storage.objects for insert
  with check (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatar_update_own on storage.objects;
create policy avatar_update_own on storage.objects for update
  using (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatar_delete_own on storage.objects;
create policy avatar_delete_own on storage.objects for delete
  using (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public read for displaying avatars.
drop policy if exists avatar_select_all on storage.objects;
create policy avatar_select_all on storage.objects for select
  using (bucket_id = 'profile-photos');
