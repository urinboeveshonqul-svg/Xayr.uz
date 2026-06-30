-- ============================================================
-- XAYR — Financial snapshots, ledger extension & reconciliation report (#46)
-- ============================================================
-- Builds ON TOP OF financial-ledger.sql (#45). It does NOT recreate the ledger;
-- it extends it (new columns + transaction types + granular withdrawal-lifecycle
-- events), adds daily financial_snapshots (for history/charts), a reconciliation
-- report, and a public chart series. Idempotent / safe to re-run.
--
-- Depends on: financial-ledger.sql (#45), payouts.sql, users, is_admin().
-- Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================

-- ── 1. Extend the ledger (reuse, don't recreate) ────────────────────────────
alter table public.financial_ledger
  add column if not exists user_id      uuid references public.users(id) on delete set null,
  add column if not exists reference_id text;

-- Widen the transaction-type set. Existing 'withdrawal' stays the money-moving
-- entry on completion (so backfilled rows + balance math are untouched); the
-- granular lifecycle types below are 0-amount audit events.
alter table public.financial_ledger drop constraint if exists financial_ledger_entry_type_check;
alter table public.financial_ledger add constraint financial_ledger_entry_type_check
  check (entry_type in (
    'donation','refund','platform_fee','provider_fee','campaign_credit',
    'withdrawal','withdrawal_requested','withdrawal_approved','withdrawal_completed','withdrawal_cancelled',
    'adjustment','admin_correction','chargeback'
  ));

create index if not exists idx_ledger_user on public.financial_ledger (user_id);

-- ── 2. Granular withdrawal-lifecycle ledger events (amount 0) ────────────────
-- The actual money movement remains the existing 'withdrawal' + 'platform_fee'
-- entries written on `paid` by ledger_on_payout_paid() (#45). These extra rows
-- are a 0-amount audit trail of the request's lifecycle, so sums are unaffected.
create or replace function public.ledger_on_payout_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'withdrawal_requested';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_type := case new.status
                when 'approved'  then 'withdrawal_approved'
                when 'cancelled' then 'withdrawal_cancelled'
                when 'rejected'  then 'withdrawal_cancelled'
                else null
              end;
  else
    v_type := null;
  end if;

  if v_type is not null then
    insert into public.financial_ledger
      (entry_type, amount, currency, campaign_id, payout_request_id, user_id, status,
       created_by, reference_id, source_key, metadata)
    values
      (v_type, 0, 'UZS', new.campaign_id, new.id, new.user_id, 'confirmed',
       new.reviewed_by, new.id::text, v_type || ':' || new.id,
       jsonb_build_object('payout_status', new.status))
    on conflict (source_key) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists trg_ledger_payout_lifecycle on public.payout_requests;
create trigger trg_ledger_payout_lifecycle after insert or update on public.payout_requests
  for each row execute function public.ledger_on_payout_lifecycle();

-- Backfill lifecycle events for existing requests (idempotent via source_key).
insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, payout_request_id, user_id, status, created_by, reference_id, source_key, created_at)
select 'withdrawal_requested', 0, 'UZS', p.campaign_id, p.id, p.user_id, 'confirmed', p.user_id, p.id::text,
       'withdrawal_requested:' || p.id, p.created_at
  from public.payout_requests p
on conflict (source_key) do nothing;

insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, payout_request_id, user_id, status, created_by, reference_id, source_key, created_at)
select 'withdrawal_approved', 0, 'UZS', p.campaign_id, p.id, p.user_id, 'confirmed', p.reviewed_by, p.id::text,
       'withdrawal_approved:' || p.id, coalesce(p.reviewed_at, p.created_at)
  from public.payout_requests p
 where p.status in ('approved','paid')
on conflict (source_key) do nothing;

insert into public.financial_ledger
  (entry_type, amount, currency, campaign_id, payout_request_id, user_id, status, created_by, reference_id, source_key, created_at)
select 'withdrawal_cancelled', 0, 'UZS', p.campaign_id, p.id, p.user_id, 'confirmed', p.reviewed_by, p.id::text,
       'withdrawal_cancelled:' || p.id, coalesce(p.reviewed_at, p.created_at)
  from public.payout_requests p
 where p.status in ('cancelled','rejected')
on conflict (source_key) do nothing;

-- ── 3. Daily financial snapshots ────────────────────────────────────────────
create table if not exists public.financial_snapshots (
  snapshot_date        date        primary key,             -- one row per day; never overwritten
  total_donations      bigint      not null default 0,      -- cumulative completed donation amount as of date
  donation_count       integer     not null default 0,
  total_withdrawn      bigint      not null default 0,       -- cumulative net paid out
  pending_withdrawals  bigint      not null default 0,
  available_funds      bigint      not null default 0,
  platform_fees        bigint      not null default 0,
  provider_fees        bigint      not null default 0,
  refunds              bigint      not null default 0,
  chargebacks          bigint      not null default 0,
  registered_users     integer     not null default 0,
  verified_campaigns   integer     not null default 0,
  active_campaigns     integer     not null default 0,
  completed_campaigns  integer     not null default 0,
  successful_campaigns integer     not null default 0,
  avg_donation         bigint      not null default 0,
  largest_donation     bigint      not null default 0,
  created_at           timestamptz not null default now()
);

alter table public.financial_snapshots enable row level security;
drop policy if exists snapshots_select_admin on public.financial_snapshots;
create policy snapshots_select_admin on public.financial_snapshots for select
  using (public.is_admin());
-- (No client writes — generated by the SECURITY DEFINER function below.)

-- Idempotent generator: one snapshot per day, never overwrites history. Returns
-- true if a row was created, false if the day already had one.
create or replace function public.generate_financial_snapshot(p_date date default current_date)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_end timestamptz := (p_date + 1)::timestamptz; v_created integer;
begin
  insert into public.financial_snapshots as fs (
    snapshot_date, total_donations, donation_count, total_withdrawn, pending_withdrawals,
    available_funds, platform_fees, provider_fees, refunds, chargebacks,
    registered_users, verified_campaigns, active_campaigns, completed_campaigns,
    successful_campaigns, avg_donation, largest_donation
  )
  select
    p_date,
    coalesce((select sum(amount) from public.donations where status='completed' and created_at < v_end), 0),
    coalesce((select count(*) from public.donations where status='completed' and created_at < v_end), 0),
    coalesce((select sum(payout_amount) from public.payout_requests where status='paid' and coalesce(paid_at, created_at) < v_end), 0),
    coalesce((select sum(amount) from public.payout_requests where status in ('pending_review','approved','info_requested')), 0),
    greatest(0,
      coalesce((select sum(current_amount) from public.campaigns), 0)
      - coalesce((select sum(amount) from public.payout_requests where status in ('pending_review','approved','info_requested','paid')), 0)),
    coalesce((select sum(commission_amount) from public.payout_requests where status='paid' and coalesce(paid_at, created_at) < v_end), 0),
    0,
    coalesce((select sum(amount) from public.donations where status='refunded' and created_at < v_end), 0),
    coalesce((select -sum(amount) from public.financial_ledger where entry_type='chargeback' and created_at < v_end), 0),
    coalesce((select count(*) from public.users where created_at < v_end), 0),
    coalesce((select count(*) from public.campaigns where status not in ('draft','pending','rejected')), 0),
    coalesce((select count(*) from public.campaigns where status='active'), 0),
    coalesce((select count(*) from public.campaigns where status='completed'), 0),
    coalesce((select count(*) from public.campaigns where status in ('completed','funded')), 0),
    coalesce((select round(avg(amount)) from public.donations where status='completed' and created_at < v_end), 0),
    coalesce((select max(amount) from public.donations where status='completed' and created_at < v_end), 0)
  on conflict (snapshot_date) do nothing;

  get diagnostics v_created = row_count;
  return v_created > 0;
end; $$;

grant execute on function public.generate_financial_snapshot(date) to service_role;

-- Seed today's snapshot so charts have at least one point immediately.
select public.generate_financial_snapshot(current_date);

-- ── 4. Reconciliation report (admin) ────────────────────────────────────────
-- Full per-campaign breakdown of the accounting identity:
--   total_donations = campaign_credits + platform_fees + provider_fees
--                     + withdrawals + refunds
-- Returns every campaign with money, plus an is_balanced flag.
create or replace function public.reconciliation_report()
returns table (
  campaign_id      uuid,
  campaign_title   text,
  total_donations  bigint,
  campaign_credits bigint,
  platform_fees    bigint,
  provider_fees    bigint,
  withdrawals      bigint,
  refunds          bigint,
  available_balance bigint,
  discrepancy      bigint,
  is_balanced      boolean
)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      ca.id, ca.title,
      coalesce((select sum(d.amount) from public.donations d
                 where d.campaign_id=ca.id and d.status in ('completed','refunded')), 0)::bigint as total_donations,
      coalesce((select sum(p.commission_amount) from public.payout_requests p
                 where p.campaign_id=ca.id and p.status='paid'), 0)::bigint as platform_fees,
      coalesce((select sum(p.payout_amount) from public.payout_requests p
                 where p.campaign_id=ca.id and p.status='paid'), 0)::bigint as withdrawals,
      coalesce((select sum(d.amount) from public.donations d
                 where d.campaign_id=ca.id and d.status='refunded'), 0)::bigint as refunds,
      public.campaign_available_balance(ca.id)::bigint as available_balance,
      coalesce((select sum(p.amount) from public.payout_requests p
                 where p.campaign_id=ca.id and p.status in ('pending_review','approved','info_requested')), 0)::bigint as pending
    from public.campaigns ca
  )
  select
    c.id, c.title, c.total_donations,
    (c.available_balance + c.pending) as campaign_credits,
    c.platform_fees, 0::bigint as provider_fees, c.withdrawals, c.refunds, c.available_balance,
    (c.total_donations
      - ((c.available_balance + c.pending) + c.platform_fees + 0 + c.withdrawals + c.refunds)) as discrepancy,
    (c.total_donations
      = ((c.available_balance + c.pending) + c.platform_fees + 0 + c.withdrawals + c.refunds)) as is_balanced
  from c
  where c.total_donations > 0 or c.withdrawals > 0
  order by abs(c.total_donations
      - ((c.available_balance + c.pending) + c.platform_fees + 0 + c.withdrawals + c.refunds)) desc;
$$;

grant execute on function public.reconciliation_report() to service_role;

-- ── 5. Extend public stats (add avg + largest) ──────────────────────────────
-- Was created with 7 output columns in #45; adding avg/largest changes the
-- return type, and CREATE OR REPLACE cannot change a function's return type, so
-- drop first (idempotent). Grants are re-applied below after recreation.
drop function if exists public.public_financial_stats();
create or replace function public.public_financial_stats()
returns table (
  total_donations    bigint,
  total_raised       bigint,
  total_delivered    bigint,
  successful_campaigns bigint,
  active_campaigns   bigint,
  verified_campaigns bigint,
  registered_users   bigint,
  avg_donation       bigint,
  largest_donation   bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.donations where status = 'completed'),
    (select coalesce(sum(amount), 0) from public.donations where status = 'completed'),
    (select coalesce(sum(payout_amount), 0) from public.payout_requests where status = 'paid'),
    (select count(*) from public.campaigns where status in ('completed','funded')),
    (select count(*) from public.campaigns where status = 'active'),
    (select count(*) from public.campaigns where status not in ('draft','pending','rejected')),
    (select count(*) from public.users),
    (select coalesce(round(avg(amount)), 0) from public.donations where status = 'completed'),
    (select coalesce(max(amount), 0) from public.donations where status = 'completed');
$$;

grant execute on function public.public_financial_stats() to anon, authenticated;

-- ── 6. Public chart series (aggregated by month; SAFE — no PII) ──────────────
create or replace function public.public_financial_series(p_months integer default 12)
returns table (
  month       date,
  donations   bigint,
  withdrawals bigint,
  fees        bigint
)
language sql stable security definer set search_path = public as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - ((greatest(p_months,1) - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    )::date as month
  )
  select
    m.month,
    coalesce((select sum(d.amount) from public.donations d
               where d.status='completed' and date_trunc('month', d.created_at)::date = m.month), 0)::bigint,
    coalesce((select sum(p.payout_amount) from public.payout_requests p
               where p.status='paid' and date_trunc('month', coalesce(p.paid_at, p.created_at))::date = m.month), 0)::bigint,
    coalesce((select sum(p.commission_amount) from public.payout_requests p
               where p.status='paid' and date_trunc('month', coalesce(p.paid_at, p.created_at))::date = m.month), 0)::bigint
  from months m
  order by m.month;
$$;

grant execute on function public.public_financial_series(integer) to anon, authenticated;
