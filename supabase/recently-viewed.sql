-- ============================================================
-- XAYR — Recently Viewed campaigns (logged-in history)
-- Per-user view history (guests use localStorage instead). Owner-only RLS.
-- record_campaign_view() upserts (dedup + move-to-top) and prunes to 20/user.
-- Does NOT touch the campaigns.views analytics counter.
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

create table if not exists public.recently_viewed (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id)     on delete cascade,
  campaign_id uuid        not null references public.campaigns(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  unique (user_id, campaign_id)
);

create index if not exists idx_recent_user on public.recently_viewed (user_id, viewed_at desc);

alter table public.recently_viewed enable row level security;

drop policy if exists recent_select_own on public.recently_viewed;
drop policy if exists recent_insert_own on public.recently_viewed;
drop policy if exists recent_update_own on public.recently_viewed;
drop policy if exists recent_delete_own on public.recently_viewed;
create policy recent_select_own on public.recently_viewed for select using (user_id = auth.uid());
create policy recent_insert_own on public.recently_viewed for insert with check (user_id = auth.uid());
create policy recent_update_own on public.recently_viewed for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recent_delete_own on public.recently_viewed for delete using (user_id = auth.uid());

-- Record a view: upsert (dedup + move to top), then prune to the latest 20.
-- Skips the campaign owner's own campaigns. Runs as the caller (auth.uid()).
create or replace function public.record_campaign_view(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  if exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_user) then
    return;  -- don't record your own campaign
  end if;

  insert into public.recently_viewed (user_id, campaign_id, viewed_at)
  values (v_user, p_campaign_id, now())
  on conflict (user_id, campaign_id) do update set viewed_at = now();

  delete from public.recently_viewed r
   where r.user_id = v_user
     and r.id not in (
       select id from public.recently_viewed
        where user_id = v_user
        order by viewed_at desc
        limit 20
     );
end; $$;

grant execute on function public.record_campaign_view(uuid) to authenticated;
