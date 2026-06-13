-- ===========================================================================
-- Google OAuth support — resilient profile creation
-- ===========================================================================
-- Run this AFTER enabling the Google provider in the Supabase dashboard
-- (Authentication → Providers → Google). It hardens the existing
-- handle_new_user() trigger so first-time Google sign-ins create a complete
-- public.users profile regardless of which metadata shape Google returns.
--
-- Email/password signups put the display name in raw_user_meta_data.full_name;
-- Google's provider may instead populate `name` and `picture`. Coalescing
-- across both means no Google user lands without a name/avatar.
--
-- Idempotent — safe to run multiple times. No app code change is required;
-- the OAuth client ID/secret live ONLY in the Supabase dashboard, never here.
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

-- The on_auth_user_created trigger already points at this function (see
-- schema.sql §4.3) — replacing the function body is enough, no re-trigger needed.
