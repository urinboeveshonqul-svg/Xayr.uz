-- ============================================================
-- XAYR — Saved payment methods (Click card tokens) — migration #64
-- ============================================================
-- OPTIONAL feature: lets an authenticated returning donor pay with a previously
-- saved Click card token. Purely ADDITIVE — the donations table, confirmDonation,
-- callbacks, ledger, commissions, balances, withdrawals, admin and Checkout JS
-- are all untouched. A saved-card payment still creates a normal `pending`
-- donation with a `payment_ref` and is finalised by the existing confirmDonation.
--
-- Security model:
--   • token_ciphertext holds an AES-256-GCM blob (encrypted app-side by
--     lib/crypto/token-cipher.ts). It is NEVER granted to anon/authenticated —
--     only the service role can read it, and only backend code can decrypt it.
--   • Never store PAN / CVV / expiry / OTP — only the encrypted token + last4 +
--     brand + holder.
--   • All writes go through SECURITY DEFINER RPCs (no client write policies), so
--     ownership and the single-default invariant can't be forged — same pattern
--     as payouts/donations.
--
-- Run in: Supabase Dashboard -> SQL Editor. Idempotent / safe to re-run.
-- Depends on: schema.sql (users). Requires PAYMENT_TOKEN_ENC_KEY +
-- CLICK_MERCHANT_USER_ID set in the app before the feature is offered.
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────
create table if not exists public.saved_payment_methods (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.users(id) on delete cascade,
  provider         text        not null default 'click' check (provider in ('click')),
  -- Encrypted Click card token (AES-256-GCM base64 blob). Service-role read ONLY.
  token_ciphertext text        not null,
  enc_version      smallint    not null default 1,
  -- Non-secret Click token handle, if the API returns one distinct from the token.
  token_id         text,
  -- Display-safe, non-sensitive metadata:
  card_brand       text        check (card_brand in ('uzcard','humo')),
  last4            text        check (last4 ~ '^[0-9]{4}$'),
  card_holder      text,
  -- State:
  is_default       boolean     not null default false,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_used_at     timestamptz
);

-- ── 2. Indexes ──────────────────────────────────────────────
create index if not exists idx_spm_user on public.saved_payment_methods (user_id) where is_active;
-- At most one default among a user's ACTIVE cards.
create unique index if not exists uniq_spm_default
  on public.saved_payment_methods (user_id) where is_default and is_active;

drop trigger if exists trg_spm_touch on public.saved_payment_methods;
create trigger trg_spm_touch before update on public.saved_payment_methods
  for each row execute function public.set_updated_at();

-- ── 3. RLS + column grants ──────────────────────────────────
alter table public.saved_payment_methods enable row level security;

-- Lock the table down, then grant ONLY the display columns to authenticated.
-- token_ciphertext / enc_version are never granted → unreadable by clients and
-- admins; only the service role (which bypasses grants) can read them.
revoke all on public.saved_payment_methods from anon, authenticated;
grant select (id, user_id, provider, token_id, card_brand, last4, card_holder,
              is_default, is_active, created_at, updated_at, last_used_at)
  on public.saved_payment_methods to authenticated;

drop policy if exists spm_select_own on public.saved_payment_methods;
create policy spm_select_own on public.saved_payment_methods for select
  using (user_id = auth.uid());
-- Intentionally NO insert/update/delete policies — writes go through the
-- SECURITY DEFINER RPCs below. Admins get no policy → cannot read rows/tokens.

-- ── 4. Write RPCs (SECURITY DEFINER; owner-scoped) ──────────
-- save_card: insert an encrypted token for the caller. First active card (or an
-- explicit request) becomes the default; the single-default invariant is kept.
create or replace function public.save_card(
  p_provider         text,
  p_token_ciphertext text,
  p_enc_version      smallint,
  p_token_id         text,
  p_card_brand       text,
  p_last4            text,
  p_card_holder      text,
  p_make_default     boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_id       uuid;
  v_is_first boolean;
  v_default  boolean;
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  if p_token_ciphertext is null or length(p_token_ciphertext) = 0 then raise exception 'invalid_token'; end if;

  select not exists (select 1 from public.saved_payment_methods where user_id = v_uid and is_active)
    into v_is_first;
  v_default := coalesce(p_make_default, false) or v_is_first;

  insert into public.saved_payment_methods
    (user_id, provider, token_ciphertext, enc_version, token_id,
     card_brand, last4, card_holder, is_default, is_active)
  values
    (v_uid, coalesce(p_provider, 'click'), p_token_ciphertext, coalesce(p_enc_version, 1::smallint),
     p_token_id, p_card_brand, p_last4, p_card_holder, v_default, true)
  returning id into v_id;

  if v_default then
    update public.saved_payment_methods
       set is_default = false
     where user_id = v_uid and id <> v_id and is_default;
  end if;

  return v_id;
end; $$;

create or replace function public.set_default_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if not exists (select 1 from public.saved_payment_methods
                  where id = p_card_id and user_id = auth.uid() and is_active) then
    raise exception 'card_not_found';
  end if;
  update public.saved_payment_methods
     set is_default = (id = p_card_id)
   where user_id = auth.uid() and is_active;
end; $$;

create or replace function public.deactivate_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  update public.saved_payment_methods
     set is_active = false, is_default = false
   where id = p_card_id and user_id = auth.uid();
end; $$;

create or replace function public.delete_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  delete from public.saved_payment_methods
   where id = p_card_id and user_id = auth.uid();
end; $$;

grant execute on function public.save_card(text, text, smallint, text, text, text, text, boolean) to authenticated;
grant execute on function public.set_default_card(uuid) to authenticated;
grant execute on function public.deactivate_card(uuid)  to authenticated;
grant execute on function public.delete_card(uuid)      to authenticated;

-- ============================================================
-- VERIFY (read-only):
--   select column_name from information_schema.column_privileges
--    where table_name='saved_payment_methods' and grantee='authenticated';
--   -- token_ciphertext / enc_version must NOT appear.
-- ============================================================
