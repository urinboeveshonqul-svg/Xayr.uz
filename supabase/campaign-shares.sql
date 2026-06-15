-- ============================================================
-- XAYR — Campaign share tracking
-- ============================================================
-- Records every share action (WhatsApp / Telegram / Facebook / X / copy link /
-- native share sheet) so a campaign owner can see which channels drive traffic.
-- Sharers are often logged OUT, so INSERT is open to everyone; reads are blocked
-- for clients and exposed only through the owner-only aggregate RPC below.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Idempotent.
-- ============================================================

create table if not exists public.campaign_shares (
  id          uuid        primary key default gen_random_uuid(),
  campaign_id uuid        not null references public.campaigns(id) on delete cascade,
  source      text        not null
                check (source in ('whatsapp','telegram','facebook','x','copy_link','native','other')),
  created_at  timestamptz not null default now()
);

-- One composite index serves both the aggregate (group by source) and cleanup.
create index if not exists idx_campaign_shares_campaign
  on public.campaign_shares (campaign_id, source);

alter table public.campaign_shares enable row level security;

-- Anyone (anon + authenticated) may record a share; the CHECK keeps `source`
-- to the known set. No SELECT policy → clients can never read raw rows.
grant insert on public.campaign_shares to anon, authenticated;

drop policy if exists shares_insert_any on public.campaign_shares;
create policy shares_insert_any on public.campaign_shares
  for insert
  with check (source in ('whatsapp','telegram','facebook','x','copy_link','native','other'));

-- Owner-only aggregated counts per source. SECURITY DEFINER so it can read the
-- table (which has no client SELECT policy) after verifying ownership/admin.
create or replace function public.get_share_stats(p_campaign_id uuid)
returns table (source text, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.campaigns c
     where c.id = p_campaign_id
       and (c.user_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'forbidden';
  end if;

  return query
    select s.source, count(*)::bigint
      from public.campaign_shares s
     where s.campaign_id = p_campaign_id
     group by s.source;
end; $$;

grant execute on function public.get_share_stats(uuid) to authenticated;
