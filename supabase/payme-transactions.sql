-- ============================================================
-- XAYR — Payme merchant-API transactions (migration #48)
-- ============================================================
-- Payme's Merchant API is a stateful JSON-RPC protocol: Payme creates a
-- transaction, performs it, may cancel it, and later audits it (CheckTransaction
-- / GetStatement) — echoing the exact timestamps we recorded. That state lives
-- here, one row per Payme transaction, keyed by Payme's transaction id.
--
--   state:  1 created · 2 performed · -1 cancelled · -2 cancelled after perform
--   times:  Unix milliseconds, Payme convention (0 = not yet)
--
-- The donation itself stays the source of truth for money (payment_ref =
-- 'payme_<donationId>'); crediting still goes only through confirmDonation().
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql + #47).
-- Idempotent.
-- ============================================================

create table if not exists public.payme_transactions (
  id           uuid        primary key default gen_random_uuid(),
  paycom_id    text        not null unique,   -- Payme's transaction id
  donation_id  uuid        not null references public.donations(id) on delete restrict,
  order_ref    text        not null,          -- donations.payment_ref (account.order_id)
  amount       bigint      not null,          -- tiyin (1 so'm = 100 tiyin)
  state        integer     not null default 1,
  create_time  bigint      not null,          -- ms — echoed verbatim to Payme
  perform_time bigint      not null default 0,
  cancel_time  bigint      not null default 0,
  reason       integer,                       -- Payme cancel reason code
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One ACTIVE (state=1) transaction per donation — a second CreateTransaction
-- for the same order must be answered "order busy" (spec).
create unique index if not exists payme_transactions_active_donation_key
  on public.payme_transactions (donation_id) where state = 1;

create index if not exists idx_payme_transactions_donation on public.payme_transactions (donation_id);
create index if not exists idx_payme_transactions_created  on public.payme_transactions (create_time);

drop trigger if exists trg_payme_transactions_updated_at on public.payme_transactions;
create trigger trg_payme_transactions_updated_at
  before update on public.payme_transactions
  for each row execute function public.set_updated_at();

alter table public.payme_transactions enable row level security;

-- Gateway state is sensitive operational data: admins may read; all writes
-- happen via the service role inside the merchant-API route.
drop policy if exists payme_transactions_select_admin on public.payme_transactions;
create policy payme_transactions_select_admin on public.payme_transactions
  for select using (public.is_admin());
