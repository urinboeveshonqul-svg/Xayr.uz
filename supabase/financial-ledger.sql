-- ============================================================
-- XAYR — Financial ledger, summary & integrity (#45)
-- ============================================================
-- An IMMUTABLE, append-only ledger: every confirmed money movement becomes a
-- discrete row. Entries are written ONLY by triggers (donations / payouts) and
-- a SECURITY DEFINER admin-adjustment function. There are no client write
-- policies, and a guard trigger forbids UPDATE/DELETE even for the table owner /
-- service role, so the audit trail can never be altered or erased.
--
-- Sign convention (amount, bigint, magnitude+direction):
--   donation      +amount   (funds into the campaign pool)
--   refund        -amount   (funds returned to a donor)
--   withdrawal    -payout_amount   (net paid out to the creator)
--   platform_fee  -commission      (platform revenue taken at payout)
--   provider_fee  -fee             (payment-provider cost; 0 until a gateway exists)
--   adjustment / admin_correction  ±amount (manual, admin-only, reason required)
--
-- Depends on: schema.sql (donations, payouts via payouts.sql + payout-commission.sql),
--             is_admin(), campaign_available_balance(), admin_audit_log (#31).
-- Run in: Supabase Dashboard -> SQL Editor. Idempotent / safe to re-run.
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────
create table if not exists public.financial_ledger (
  id                uuid        primary key default gen_random_uuid(),
  entry_type        text        not null check (entry_type in
                      ('donation','refund','platform_fee','provider_fee',
                       'withdrawal','adjustment','admin_correction')),
  amount            bigint      not null,            -- signed; see header
  currency          text        not null default 'UZS',
  campaign_id       uuid        references public.campaigns(id) on delete set null,
  donation_id       uuid        references public.donations(id) on delete set null,
  payout_request_id uuid        references public.payout_requests(id) on delete set null,
  status            text        not null default 'confirmed'
                      check (status in ('confirmed','pending','reversed')),
  created_by        uuid        references public.users(id) on delete set null, -- null = system
  reason            text,                            -- required for manual entries
  metadata          jsonb       not null default '{}'::jsonb,
  -- Natural key that makes automatic recording idempotent (e.g. 'donation:<uuid>').
  -- NULL for manual adjustments (Postgres allows many NULLs in a UNIQUE column).
  source_key        text        unique,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ledger_campaign on public.financial_ledger (campaign_id, created_at desc);
create index if not exists idx_ledger_type     on public.financial_ledger (entry_type, created_at desc);
create index if not exists idx_ledger_created  on public.financial_ledger (created_at desc);
create index if not exists idx_ledger_donation on public.financial_ledger (donation_id);
create index if not exists idx_ledger_payout   on public.financial_ledger (payout_request_id);

-- ── 2. Immutability: append-only (no UPDATE / DELETE, ever) ──
create or replace function public.forbid_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'financial_ledger is append-only: % is not allowed', tg_op;
end; $$;

drop trigger if exists trg_ledger_no_update on public.financial_ledger;
create trigger trg_ledger_no_update before update on public.financial_ledger
  for each row execute function public.forbid_ledger_mutation();

drop trigger if exists trg_ledger_no_delete on public.financial_ledger;
create trigger trg_ledger_no_delete before delete on public.financial_ledger
  for each row execute function public.forbid_ledger_mutation();

-- ── 3. RLS — read for admins (all) + campaign owners (their own); no writes ──
alter table public.financial_ledger enable row level security;

drop policy if exists ledger_select_admin_or_owner on public.financial_ledger;
create policy ledger_select_admin_or_owner on public.financial_ledger for select
  using (
    public.is_admin()
    or exists (select 1 from public.campaigns c
                where c.id = campaign_id and c.user_id = auth.uid())
  );
-- (Intentionally NO insert/update/delete policies — triggers + definer fns only.)

-- ── 4. Auto-record: donations (completed -> donation, un-complete -> refund) ──
create or replace function public.ledger_on_donation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from 'completed') then
    insert into public.financial_ledger
      (entry_type, amount, currency, campaign_id, donation_id, status, created_by, source_key, metadata, created_at)
    values
      ('donation', new.amount, 'UZS', new.campaign_id, new.id, 'confirmed', new.donor_id,
       'donation:' || new.id, jsonb_build_object('payment_ref', new.payment_ref), new.created_at)
    on conflict (source_key) do nothing;

  elsif tg_op = 'UPDATE' and old.status = 'completed' and new.status in ('refunded','failed') then
    insert into public.financial_ledger
      (entry_type, amount, currency, campaign_id, donation_id, status, source_key, metadata)
    values
      ('refund', -new.amount, 'UZS', new.campaign_id, new.id, 'confirmed',
       'refund:' || new.id, jsonb_build_object('to_status', new.status))
    on conflict (source_key) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists trg_ledger_on_donation on public.donations;
create trigger trg_ledger_on_donation after insert or update on public.donations
  for each row execute function public.ledger_on_donation();

-- ── 5. Auto-record: payout marked paid (withdrawal + platform fee) ───────────
create or replace function public.ledger_on_payout_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.financial_ledger
      (entry_type, amount, currency, campaign_id, payout_request_id, status, created_by, source_key, metadata)
    values
      ('withdrawal', -new.payout_amount, 'UZS', new.campaign_id, new.id, 'confirmed', new.reviewed_by,
       'withdrawal:' || new.id, jsonb_build_object('reference', new.payout_reference, 'gross', new.amount))
    on conflict (source_key) do nothing;

    if coalesce(new.commission_amount, 0) > 0 then
      insert into public.financial_ledger
        (entry_type, amount, currency, campaign_id, payout_request_id, status, created_by, source_key)
      values
        ('platform_fee', -new.commission_amount, 'UZS', new.campaign_id, new.id, 'confirmed', new.reviewed_by,
         'platform_fee:' || new.id)
      on conflict (source_key) do nothing;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_ledger_on_payout_paid on public.payout_requests;
create trigger trg_ledger_on_payout_paid after update on public.payout_requests
  for each row execute function public.ledger_on_payout_paid();

-- ── 6. Backfill existing data (idempotent via source_key) ────────────────────
insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, donation_id, status, created_by, source_key, created_at)
select 'donation', d.amount, 'UZS', d.campaign_id, d.id, 'confirmed', d.donor_id,
       'donation:' || d.id, d.created_at
  from public.donations d where d.status = 'completed'
on conflict (source_key) do nothing;

insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, donation_id, status, source_key, created_at)
select 'refund', -d.amount, 'UZS', d.campaign_id, d.id, 'confirmed',
       'refund:' || d.id, d.created_at
  from public.donations d where d.status = 'refunded'
on conflict (source_key) do nothing;

insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, payout_request_id, status, created_by, source_key, created_at)
select 'withdrawal', -p.payout_amount, 'UZS', p.campaign_id, p.id, 'confirmed', p.reviewed_by,
       'withdrawal:' || p.id, coalesce(p.paid_at, p.created_at)
  from public.payout_requests p where p.status = 'paid'
on conflict (source_key) do nothing;

insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, payout_request_id, status, created_by, source_key, created_at)
select 'platform_fee', -p.commission_amount, 'UZS', p.campaign_id, p.id, 'confirmed', p.reviewed_by,
       'platform_fee:' || p.id, coalesce(p.paid_at, p.created_at)
  from public.payout_requests p where p.status = 'paid' and coalesce(p.commission_amount, 0) > 0
on conflict (source_key) do nothing;

-- ── 7. Manual admin adjustment (admin + reason; logged to admin_audit_log) ───
create or replace function public.record_ledger_adjustment(
  p_campaign_id uuid,
  p_entry_type  text,
  p_amount      bigint,
  p_reason      text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_entry_type not in ('adjustment','admin_correction') then
    raise exception 'invalid_entry_type';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;

  insert into public.financial_ledger
    (entry_type, amount, currency, campaign_id, status, created_by, reason, metadata)
  values
    (p_entry_type, p_amount, 'UZS', p_campaign_id, 'confirmed', auth.uid(), p_reason,
     jsonb_build_object('manual', true))
  returning id into v_id;

  insert into public.admin_audit_log (admin_id, action, entity_type, entity_id, meta)
  values (auth.uid(), 'ledger_adjustment', 'financial_ledger', v_id,
          jsonb_build_object('campaign_id', p_campaign_id, 'amount', p_amount,
                             'entry_type', p_entry_type, 'reason', p_reason));
  return v_id;
end; $$;

grant execute on function public.record_ledger_adjustment(uuid, text, bigint, text) to authenticated;

-- ── 8. Platform financial summary (single row, service-role only) ────────────
-- All aggregation happens in the DB so the dashboard reads one row (no donation
-- table scan in app code). Time windows are evaluated at query time.
create or replace view public.financial_summary
  with (security_invoker = false) as
select
  (select coalesce(sum(amount), 0) from public.donations where status = 'completed')::bigint as total_donations_amount,
  (select count(*) from public.donations where status = 'completed')::int                     as donations_count,
  (select coalesce(sum(amount), 0) from public.donations where status = 'refunded')::bigint    as refunded_amount,
  (select coalesce(sum(amount), 0) from public.donations where status = 'pending')::bigint     as pending_payments_amount,
  (select count(*) from public.donations where status = 'pending')::int                        as pending_payments_count,
  (select coalesce(sum(amount), 0) from public.payout_requests where status = 'paid')::bigint            as withdrawn_gross,
  (select coalesce(sum(payout_amount), 0) from public.payout_requests where status = 'paid')::bigint     as net_to_creators,
  (select coalesce(sum(commission_amount), 0) from public.payout_requests where status = 'paid')::bigint as platform_fees_collected,
  0::bigint                                                                                              as provider_fees_collected,
  (select coalesce(sum(amount), 0) from public.payout_requests
     where status in ('pending_review','approved','info_requested'))::bigint                            as pending_withdrawals_amount,
  (select count(*) from public.payout_requests
     where status in ('pending_review','approved','info_requested'))::int                               as pending_withdrawals_count,
  greatest(0,
    (select coalesce(sum(current_amount), 0) from public.campaigns)
    - (select coalesce(sum(amount), 0) from public.payout_requests
         where status in ('pending_review','approved','info_requested','paid'))
  )::bigint                                                                                              as available_for_withdrawal,
  (select coalesce(max(amount), 0) from public.donations where status = 'completed')::bigint            as largest_donation,
  (select coalesce(round(avg(amount)), 0) from public.donations where status = 'completed')::bigint     as avg_donation,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('day', now()))::bigint                     as today_amount,
  (select count(*) from public.donations
     where status = 'completed' and created_at >= date_trunc('day', now()))::int                        as today_count,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('week', now()))::bigint                    as week_amount,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('month', now()))::bigint                   as month_amount,
  (select coalesce(sum(amount), 0) from public.donations
     where status = 'completed' and created_at >= date_trunc('year', now()))::bigint                    as year_amount;

revoke all on public.financial_summary from anon, authenticated;
grant select on public.financial_summary to service_role;

-- ── 9. Public transparency summary (aggregated, SAFE — no PII) ───────────────
-- Anon-readable: only high-level counts/sums. Never exposes donors, cards, or
-- withdrawal requests.
create or replace function public.public_financial_stats()
returns table (
  total_donations          bigint,
  total_raised             bigint,
  total_delivered          bigint,
  successful_campaigns      bigint,
  active_campaigns          bigint,
  verified_campaigns        bigint,
  registered_users          bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.donations where status = 'completed'),
    (select coalesce(sum(amount), 0) from public.donations where status = 'completed'),
    (select coalesce(sum(payout_amount), 0) from public.payout_requests where status = 'paid'),
    (select count(*) from public.campaigns where status in ('completed','funded')),
    (select count(*) from public.campaigns where status = 'active'),
    (select count(*) from public.campaigns where status not in ('draft','pending','rejected')),
    (select count(*) from public.users);
$$;

grant execute on function public.public_financial_stats() to anon, authenticated;

-- ── 10. Financial integrity check (admin) ───────────────────────────────────
-- Reconciles each campaign two ways and flags drift:
--   (a) conservation: current_amount must cover all committed + paid payouts;
--   (b) ledger: ledger net must equal current_amount minus gross paid payouts.
-- Returns ONLY campaigns that fail (empty result = healthy books).
create or replace function public.check_financial_integrity()
returns table (
  campaign_id   uuid,
  campaign_title text,
  raised        bigint,
  committed     bigint,
  paid_gross    bigint,
  ledger_net    bigint,
  expected_ledger bigint,
  discrepancy   bigint
)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      ca.id,
      ca.title,
      coalesce(ca.current_amount, 0)::bigint as raised,
      coalesce((select sum(p.amount) from public.payout_requests p
                 where p.campaign_id = ca.id
                   and p.status in ('pending_review','approved','info_requested')), 0)::bigint as committed,
      coalesce((select sum(p.amount) from public.payout_requests p
                 where p.campaign_id = ca.id and p.status = 'paid'), 0)::bigint as paid_gross,
      coalesce((select sum(l.amount) from public.financial_ledger l
                 where l.campaign_id = ca.id), 0)::bigint as ledger_net
    from public.campaigns ca
  )
  select
    c.id, c.title, c.raised, c.committed, c.paid_gross, c.ledger_net,
    (c.raised - c.paid_gross) as expected_ledger,
    -- non-zero on EITHER failure mode
    greatest(
      abs(c.ledger_net - (c.raised - c.paid_gross)),
      greatest(0, (c.committed + c.paid_gross) - c.raised)
    ) as discrepancy
  from c
  where c.ledger_net <> (c.raised - c.paid_gross)
     or (c.committed + c.paid_gross) > c.raised;
$$;

grant execute on function public.check_financial_integrity() to service_role;

-- ── 11. Per-campaign financial breakdown (owner/admin via RLS on base tables) ─
create or replace function public.campaign_financials(p_campaign_id uuid)
returns table (
  goal              bigint,
  raised            bigint,
  platform_fee      bigint,
  provider_fee      bigint,
  net_amount        bigint,
  total_withdrawn   bigint,
  available_balance bigint,
  pending_withdrawal bigint,
  remaining_balance bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(c.goal_amount, 0)::bigint as goal,
    coalesce(c.current_amount, 0)::bigint as raised,
    coalesce((select sum(commission_amount) from public.payout_requests p
               where p.campaign_id = c.id and p.status = 'paid'), 0)::bigint as platform_fee,
    0::bigint as provider_fee,
    coalesce((select sum(payout_amount) from public.payout_requests p
               where p.campaign_id = c.id and p.status = 'paid'), 0)::bigint as net_amount,
    coalesce((select sum(amount) from public.payout_requests p
               where p.campaign_id = c.id and p.status = 'paid'), 0)::bigint as total_withdrawn,
    public.campaign_available_balance(c.id)::bigint as available_balance,
    coalesce((select sum(amount) from public.payout_requests p
               where p.campaign_id = c.id
                 and p.status in ('pending_review','approved','info_requested')), 0)::bigint as pending_withdrawal,
    public.campaign_available_balance(c.id)::bigint as remaining_balance
  from public.campaigns c
  where c.id = p_campaign_id
    and (public.is_admin() or c.user_id = auth.uid());
$$;

grant execute on function public.campaign_financials(uuid) to authenticated;
