-- ============================================================
-- XAYR — Share channels: Instagram, Email, QR (migration #49)
-- ============================================================
-- The share sheet gained Instagram, Email and QR-code channels. Both the CHECK
-- constraint and the anon INSERT policy pin `source` to a fixed list, so a new
-- channel's analytics row would be REJECTED until they're widened. trackShare()
-- is fire-and-forget (errors swallowed so sharing never breaks), which means
-- without this migration those shares are silently lost — never blocked.
--
-- 'x' (Twitter) is deliberately RETAINED: the channel was removed from the UI,
-- but historical campaign_shares rows still hold it and get_share_stats must
-- keep reporting them. Dropping it would fail on existing data and erase
-- history.
--
-- Run in: Supabase Dashboard -> SQL Editor (after campaign-shares.sql).
-- Idempotent.
-- ============================================================

-- ── 1. Widen the CHECK constraint ───────────────────────────────────────────
alter table public.campaign_shares drop constraint if exists campaign_shares_source_check;
alter table public.campaign_shares add constraint campaign_shares_source_check
  check (source in (
    'telegram', 'whatsapp', 'facebook', 'instagram', 'email', 'qr',
    'copy_link', 'native', 'other',
    'x'  -- retired from the UI; kept so historical rows stay valid + reportable
  ));

-- ── 2. Widen the anon/authenticated INSERT policy to match ──────────────────
-- Same allow-list, re-asserted at the RLS layer (the policy's own with-check is
-- what actually gates client inserts). Recreates the EXISTING policy name from
-- campaign-shares.sql — a differently-named policy would leave the old
-- restrictive one in place alongside it.
drop policy if exists shares_insert_any on public.campaign_shares;
create policy shares_insert_any on public.campaign_shares
  for insert to anon, authenticated
  with check (source in (
    'telegram', 'whatsapp', 'facebook', 'instagram', 'email', 'qr',
    'copy_link', 'native', 'other',
    'x'
  ));

-- ============================================================
-- VERIFY:
--   insert into public.campaign_shares (campaign_id, source)
--   values ('<some-campaign-uuid>', 'qr');   -- should succeed
--   select * from get_share_stats('<some-campaign-uuid>');
-- ============================================================
