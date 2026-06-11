-- ============================================================
-- XAYR — Resubmit a rejected campaign
-- Owners can send a 'rejected' campaign back to 'pending' moderation after
-- editing it. Status is an admin-guarded column, so this SECURITY DEFINER
-- function opts into the same transaction-local guard bypass apply_donation()
-- uses. Only the owner, only rejected -> pending.
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================

create or replace function public.resubmit_campaign(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_status text;
begin
  select user_id, status into v_owner, v_status
    from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'not_campaign_owner';
  end if;
  if v_status <> 'rejected' then
    raise exception 'invalid_status';
  end if;

  perform set_config('app.guard_campaign_bypass', 'on', true);
  update public.campaigns set status = 'pending' where id = p_campaign_id;
  perform set_config('app.guard_campaign_bypass', 'off', true);
end; $$;

grant execute on function public.resubmit_campaign(uuid) to authenticated;
