-- ============================================================
-- XAYR — Campaign creation gated on KYC (identity) verification
-- ============================================================
-- Replaces the email-confirmation gate (migrations #33/#36) with KYC: only
-- users whose verification_status = 'verified' (or admins) may CREATE or PUBLISH
-- a campaign. Enforced at the database layer, so a direct API call by a
-- non-approved user is rejected (RLS denies the INSERT; the publish trigger
-- forces draft). Email confirmation remains a separate account-security signal.
--
-- Run in: Supabase Dashboard -> SQL Editor (after verification.sql). Idempotent.
-- ============================================================

-- ── Create gate: RLS insert requires approved KYC (or admin) ────────────────
drop policy if exists campaigns_insert_own on public.campaigns;
create policy campaigns_insert_own on public.campaigns for insert
  with check (
    user_id = auth.uid()
    and (public.is_verified(auth.uid()) or public.is_admin())
  );

-- ── Publish gate: only approved-KYC authors leave 'draft' ───────────────────
create or replace function public.enforce_campaign_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('pending','active')
       and not (public.is_verified(new.user_id) or public.is_admin()) then
      new.status := 'draft';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'draft' and new.status <> 'draft'
       and not (public.is_verified(new.user_id) or public.is_admin()) then
      new.status := 'draft';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_enforce_publish on public.campaigns;
create trigger trg_enforce_publish before insert or update on public.campaigns
  for each row execute function public.enforce_campaign_publish();
