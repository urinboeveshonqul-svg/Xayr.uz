-- ============================================================
-- XAYR — Server-side campaign-creation email gate
-- ============================================================
-- Enforces "verified email required to create a campaign" at the DATABASE layer,
-- so an unverified user cannot create/publish by calling the API directly. RLS
-- blocks the INSERT entirely (drafts included) unless the author's email is
-- confirmed (or they're an admin). Pairs with the client gate (VerifyEmailModal)
-- and the existing enforce_campaign_publish trigger.
--
-- Run in: Supabase Dashboard -> SQL Editor (after email-verification-gate.sql).
-- Idempotent.
-- ============================================================

drop policy if exists campaigns_insert_own on public.campaigns;
create policy campaigns_insert_own on public.campaigns for insert
  with check (
    user_id = auth.uid()
    and (public.is_email_confirmed(auth.uid()) or public.is_admin())
  );
