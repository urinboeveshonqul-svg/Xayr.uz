-- ============================================================
-- Harden donation transaction records.
--
-- Before: insert policy `with check (true)` let any client create a donation
-- with ANY status — including 'completed', which would fake-credit a campaign
-- via the apply_donation trigger.
--
-- After: clients may only create 'pending' rows for themselves (or as a guest).
-- There is NO client UPDATE policy, so only the service role (donation API /
-- payment webhooks) can move a donation to 'completed'. Records are tamper-proof.
--
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================

drop policy if exists donations_insert_any on public.donations;
drop policy if exists donations_insert_pending on public.donations;

create policy donations_insert_pending on public.donations for insert
  with check (
    status = 'pending'
    and (donor_id is null or donor_id = auth.uid())
  );

-- (Intentionally no UPDATE/DELETE policy for clients — service role only.)
-- The existing donations_select_scoped (donor / campaign owner / admin) stays.
