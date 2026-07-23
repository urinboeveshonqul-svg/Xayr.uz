-- ============================================================
-- XAYR — Optional campaign video link (Instagram post/reel)
-- ============================================================
-- Adds a single nullable column to campaigns AND campaign_drafts so a creator can
-- attach ONE optional Instagram post/reel permalink. We intentionally do not host
-- or embed video — the campaign page shows a "Watch video on Instagram" link that
-- opens this URL in a new tab.
--
-- The URL is validated + normalized to a canonical permalink server-side
-- (lib/video) before it is ever written, so the column only ever holds a clean
-- https://www.instagram.com/(p|reel)/<shortcode>/ value or NULL.
--
-- SAFE / NON-BREAKING:
--   • Nullable, no default, no backfill — every existing campaign keeps
--     video_url = NULL and continues to work unchanged.
--   • No constraint/trigger/RLS change. video_url is an ordinary owner-editable
--     content column (the guard trigger only locks status/current_amount/
--     donors_count/views), so the existing edit path can add/replace/remove it.
--
-- Idempotent — safe to re-run. Run in: Supabase Dashboard → SQL Editor.
-- ============================================================

alter table public.campaigns       add column if not exists video_url text;
alter table public.campaign_drafts  add column if not exists video_url text;

-- ============================================================
-- ROLLBACK (optional):
--   alter table public.campaigns      drop column if exists video_url;
--   alter table public.campaign_drafts drop column if exists video_url;
-- ============================================================
