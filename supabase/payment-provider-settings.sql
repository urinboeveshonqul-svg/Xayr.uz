-- ============================================================
-- XAYR — Payment provider settings (migration #47)
-- ============================================================
-- Admin-controlled payment provider catalog:
--   • payment_provider_settings — enable/disable a provider, mark it
--     "Coming Soon", set display order, choose the default — all with
--     NO code changes (/admin/payments UI; read server-side by
--     lib/payments/catalog.ts on every donation page render).
--   • Widens donations.payment_method to future provider ids
--     ('paynet', 'uzum') so new gateways reuse the same schema.
--
-- The app FAILS OPEN to safe defaults (Click live when configured,
-- others Coming Soon) until this migration is applied.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql).
-- Idempotent.
-- ============================================================

-- ── 1. Settings table ───────────────────────────────────────────────────────
create table if not exists public.payment_provider_settings (
  id          text        primary key,          -- 'click' | 'payme' | 'paynet' | 'uzum' | …
  enabled     boolean     not null default false,
  coming_soon boolean     not null default true,
  priority    integer     not null default 100, -- lower = shown first
  is_default  boolean     not null default false,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_payment_provider_settings_updated_at on public.payment_provider_settings;
create trigger trg_payment_provider_settings_updated_at
  before update on public.payment_provider_settings
  for each row execute function public.set_updated_at();

alter table public.payment_provider_settings enable row level security;

-- Availability is public information (the donation form shows it to everyone).
drop policy if exists payment_provider_settings_select_all on public.payment_provider_settings;
create policy payment_provider_settings_select_all on public.payment_provider_settings
  for select using (true);

-- Writes: admins only (the admin API also re-verifies the role server-side
-- and writes via the service role — this policy is defense in depth).
drop policy if exists payment_provider_settings_admin_write on public.payment_provider_settings;
create policy payment_provider_settings_admin_write on public.payment_provider_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. Seed the planned catalog (never overwrites admin changes) ────────────
insert into public.payment_provider_settings (id, enabled, coming_soon, priority, is_default) values
  ('click',  true,  false, 10, true),
  ('payme',  false, true,  20, false),
  ('paynet', false, true,  30, false),
  ('uzum',   false, true,  40, false)
on conflict (id) do nothing;

-- ── 3. Future-proof donations.payment_method ────────────────────────────────
-- Same records schema for every future provider: only the CHECK list grows.
alter table public.donations drop constraint if exists donations_payment_method_check;
alter table public.donations add constraint donations_payment_method_check
  check (payment_method in ('click', 'payme', 'paynet', 'uzum', 'uzcard', 'humo', 'cash'));
