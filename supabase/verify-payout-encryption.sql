-- ============================================================
-- XAYR — Payout encryption backfill verification (READ-ONLY)
-- ============================================================
-- Run in: Supabase Dashboard -> SQL Editor, AFTER the phase-2 backfill
-- (POST /api/admin/payouts/backfill-encryption) reports complete.
-- Changes nothing — it only counts.
--
-- GATE FOR PHASE 3: every "remaining" figure in section 1 must be 0 before the
-- plaintext columns may be dropped. A non-zero "remaining" means a row still has
-- a plaintext value with no ciphertext — dropping the column would destroy it.
-- ============================================================

-- ── 1. Coverage rollup (the go/no-go table) ─────────────────────────────────
select
  'payout_accounts' as table_name,
  count(*)                                                              as total,
  count(*) filter (where secret_enc is not null)                        as encrypted,
  count(*) filter (where secret_enc is null and card_number is not null) as remaining_plaintext,
  count(*) filter (where secret_enc is null and card_number is null)     as no_data,
  count(*) filter (where secret_enc is not null and secret_last4 is null) as missing_last4,
  case
    when count(*) filter (where secret_enc is null and card_number is not null) = 0
      then '✅ READY FOR PHASE 3'
    else '❌ BACKFILL INCOMPLETE'
  end as status
from public.payout_accounts

union all

select
  'payout_requests',
  count(*),
  count(*) filter (where snap_secret_enc is not null),
  count(*) filter (where snap_secret_enc is null and snap_card_number is not null),
  count(*) filter (where snap_secret_enc is null and snap_card_number is null),
  count(*) filter (where snap_secret_enc is not null and snap_secret_last4 is null),
  case
    when count(*) filter (where snap_secret_enc is null and snap_card_number is not null) = 0
      then '✅ READY FOR PHASE 3'
    else '❌ BACKFILL INCOMPLETE'
  end
from public.payout_requests;


-- ── 2. key_version distribution (rotation readiness) ────────────────────────
select 'payout_accounts' as table_name, key_version, count(*) as rows
  from public.payout_accounts
 where secret_enc is not null
 group by key_version
union all
select 'payout_requests', snap_key_version, count(*)
  from public.payout_requests
 where snap_secret_enc is not null
 group by snap_key_version
 order by table_name, key_version;


-- ── 3. Integrity spot-checks ────────────────────────────────────────────────
-- (a) The stored last4 must match the plaintext's last 4 while both still
--     exist. Any row returned here means the backfill mis-encoded — STOP.
select 'payout_accounts' as table_name, user_id::text as id,
       secret_last4, right(card_number, 4) as plaintext_last4
  from public.payout_accounts
 where secret_enc is not null
   and card_number is not null
   and secret_last4 is distinct from right(card_number, 4)
union all
select 'payout_requests', id::text,
       snap_secret_last4, right(snap_card_number, 4)
  from public.payout_requests
 where snap_secret_enc is not null
   and snap_card_number is not null
   and snap_secret_last4 is distinct from right(snap_card_number, 4);
-- Expect: 0 rows.

-- (b) Ciphertext must never contain a raw 16-digit PAN (sanity check that the
--     envelope really is encrypted, not accidentally stored plaintext).
select count(*) as ciphertext_looks_like_plaintext
  from public.payout_accounts
 where secret_enc ~ '[0-9]{16}';
-- Expect: 0.

-- (c) Historical payout totals must be untouched by the backfill. Compare
--     against a figure captured BEFORE the backfill run.
select count(*) as paid_requests,
       coalesce(sum(amount), 0)            as gross_total,
       coalesce(sum(commission_amount), 0) as commission_total,
       coalesce(sum(payout_amount), 0)     as net_total
  from public.payout_requests
 where status = 'paid';
-- Expect: identical to the pre-backfill snapshot.
