-- ============================================================
-- XAYR — Campaign view tracking
-- Increments campaigns.views safely:
--   * views is an admin-guarded column → we opt into the same transaction-local
--     bypass flag that apply_donation() uses, so the field guard allows it.
--   * a page view must NOT bump updated_at (Success Stories order by / display
--     updated_at) → set_updated_at gains a transaction-local opt-out flag.
-- No new tables. Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================

-- Extend the shared touch trigger with a transaction-local opt-out. Default
-- behaviour is unchanged everywhere (the flag is unset → bumps as before).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  if current_setting('app.skip_touch', true) = 'on' then
    return new;  -- view-count path: preserve updated_at
  end if;
  new.updated_at = now();
  return new;
end; $$;

-- Increment a campaign's view counter (SECURITY DEFINER bypasses the field guard
-- + skips the updated_at touch). Owner-exclusion / dedup happen in the API layer.
create or replace function public.increment_campaign_views(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.guard_campaign_bypass', 'on', true);
  perform set_config('app.skip_touch', 'on', true);
  update public.campaigns set views = views + 1 where id = p_campaign_id;
  perform set_config('app.skip_touch', 'off', true);
  perform set_config('app.guard_campaign_bypass', 'off', true);
end; $$;

grant execute on function public.increment_campaign_views(uuid) to anon, authenticated;
