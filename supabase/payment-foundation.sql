-- ============================================================
-- XAYR — Payment foundation (provider-ready hardening)
-- ============================================================
-- Additive only. Does NOT change the donation flow:
--   1. payment_ref uniqueness + fast lookup index
--   2. payment_events log (idempotency + reconciliation + audit)
-- Future providers (Payme/Click/Uzum/Octobank/…) reuse these without redesign.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql + secure-donations-rls.sql).
-- Idempotent.
-- ============================================================

-- ── 1. payment_ref integrity ────────────────────────────────────────────────
-- Unique per reference (the provider's transaction id) + indexed for the
-- webhook's by-ref lookup. Partial so legacy NULL refs don't collide.
create unique index if not exists donations_payment_ref_key
  on public.donations (payment_ref) where payment_ref is not null;

-- ── 2. payment_events: every webhook is logged before processing ────────────
create table if not exists public.payment_events (
  id                uuid        primary key default gen_random_uuid(),
  provider          text        not null,
  provider_event_id text,                       -- gateway's event id (dedupe key)
  payment_ref       text,
  donation_id       uuid        references public.donations(id) on delete set null,
  status            text,                        -- pending/completed/failed/refunded
  amount            bigint,
  currency          text,
  raw_payload       jsonb,
  signature_valid   boolean,
  processed         boolean     not null default false,
  processed_at      timestamptz,
  received_at       timestamptz not null default now(),
  error_message     text
);

-- Dedupe: one row per gateway event (when an id is provided).
create unique index if not exists payment_events_provider_event_key
  on public.payment_events (provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_payment_events_ref      on public.payment_events (payment_ref);
create index if not exists idx_payment_events_donation on public.payment_events (donation_id);
create index if not exists idx_payment_events_status   on public.payment_events (status, received_at desc);
create index if not exists idx_payment_events_received on public.payment_events (received_at desc);

alter table public.payment_events enable row level security;

-- Sensitive (raw provider payloads): admins may read; everyone else is blocked.
-- Writes happen only via the service role (RLS bypassed) in the webhook path.
drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin on public.payment_events
  for select using (public.is_admin());
