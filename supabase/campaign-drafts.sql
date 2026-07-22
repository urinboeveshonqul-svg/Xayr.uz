-- ============================================================
-- XAYR — Campaign drafts (auto-saved, private work-in-progress)
-- ============================================================
-- Lets a creator save an UNFINISHED campaign and come back to it. A draft holds
-- the partial create-form state (every field nullable) plus the URLs of images
-- already uploaded to the campaign-images bucket, so uploads stay associated
-- with the draft across sessions.
--
-- WHY A SEPARATE TABLE (not campaigns.status = 'draft'):
--   public.campaigns has NOT NULL title/slug/description/goal_amount + a UNIQUE
--   slug, so a half-filled form cannot be persisted there. Drafts are pre-campaign
--   scratch state; on submit the client posts the draft through the EXISTING
--   /api/campaigns/create route (Turnstile + KYC gate + publish trigger all still
--   apply) and then deletes the draft row. No campaign logic is duplicated — the
--   real campaign is still created the one existing way.
--
-- PRIVACY: owner-only RLS on every operation. A draft is NEVER public and never
--   appears in any listing (those all query public.campaigns, not this table).
--
-- Depends on: public.users, public.set_updated_at().
-- Run in: Supabase Dashboard → SQL Editor.
-- Idempotent — safe to re-run. No existing data is touched.
-- ============================================================

-- ── 1. Table (all content columns nullable — a draft may be incomplete) ─────
create table if not exists public.campaign_drafts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  title       text,
  description text,
  story       text,
  category    text,              -- category slug (resolved to category_id on submit)
  goal_amount bigint,
  location    text,
  deadline    text,              -- 'YYYY-MM-DD' as entered in the form
  is_urgent   boolean     not null default false,
  image_url   text,              -- cover image (already in the campaign-images bucket)
  images      text[]      not null default '{}',   -- gallery image URLs
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_campaign_drafts_user
  on public.campaign_drafts (user_id, updated_at desc);

drop trigger if exists trg_campaign_drafts_touch on public.campaign_drafts;
create trigger trg_campaign_drafts_touch before update on public.campaign_drafts
  for each row execute function public.set_updated_at();

-- ── 2. RLS — owner-only for read AND write (drafts are private scratch data) ─
-- Unlike extension requests / payouts (definer-only writes because status must
-- not be forgeable), a draft carries no privileged fields — it is the owner's
-- own form state — so direct owner CRUD is safe and mirrors campaign_updates.
alter table public.campaign_drafts enable row level security;

drop policy if exists campaign_drafts_select_own on public.campaign_drafts;
drop policy if exists campaign_drafts_insert_own on public.campaign_drafts;
drop policy if exists campaign_drafts_update_own on public.campaign_drafts;
drop policy if exists campaign_drafts_delete_own on public.campaign_drafts;

create policy campaign_drafts_select_own on public.campaign_drafts for select
  using (user_id = auth.uid());
create policy campaign_drafts_insert_own on public.campaign_drafts for insert
  with check (user_id = auth.uid());
create policy campaign_drafts_update_own on public.campaign_drafts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy campaign_drafts_delete_own on public.campaign_drafts for delete
  using (user_id = auth.uid());

-- ============================================================
-- VERIFY (run as an authenticated owner):
--   insert into public.campaign_drafts (user_id, title) values (auth.uid(), 'wip');
--   select id, title, updated_at from public.campaign_drafts;   -- only own rows
-- ============================================================
