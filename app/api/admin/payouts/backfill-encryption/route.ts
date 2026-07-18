import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret, isPayoutCryptoConfigured, last4 } from '@/lib/payout-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * PHASE 2 backfill — encrypt existing plaintext payout data.
 *
 * Runs in the server environment because that is the only place the encryption
 * key exists (PAYOUT_ENCRYPTION_KEY is server-only, and .env.local holds
 * placeholders). Admin-gated, POST-only.
 *
 * SAFETY PROPERTIES
 *  • Idempotent + resumable — it only selects rows where the ciphertext is still
 *    NULL and a plaintext value exists, so re-running never re-encrypts, never
 *    double-writes and safely continues where a previous run stopped.
 *  • Non-destructive — it ONLY fills the new columns. The plaintext columns and
 *    every historical value (amount, commission, status, dates, snapshots) are
 *    left exactly as they are. Card numbers are re-encoded, never regenerated.
 *  • Fails closed — if encryption of any row throws, that row is recorded as
 *    failed and the run ABORTS immediately rather than continuing past an
 *    encryption fault.
 *  • Batched — BATCH rows per table per call, so a large table is processed by
 *    calling this repeatedly until `remaining` reaches 0.
 *
 * Usage:
 *   POST /api/admin/payouts/backfill-encryption          → process one batch
 *   POST /api/admin/payouts/backfill-encryption?dry=1    → report only, write nothing
 */

const BATCH = 200;

interface TableReport {
  scanned: number;
  encrypted: number;
  failed: number;
  remaining: number;
  total: number;
  alreadyEncrypted: number;
}

const emptyReport = (): TableReport => ({
  scanned: 0,
  encrypted: 0,
  failed: 0,
  remaining: 0,
  total: 0,
  alreadyEncrypted: 0,
});

export async function POST(request: Request) {
  // ── 1. Admin only, verified server-side ──────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 });
  }

  // ── 2. Refuse to run without a key (never silently skip encryption) ──────
  if (!isPayoutCryptoConfigured()) {
    return NextResponse.json(
      { error: 'encryption_unavailable', detail: 'PAYOUT_ENCRYPTION_KEY is not set.' },
      { status: 503 }
    );
  }

  const dryRun = new URL(request.url).searchParams.get('dry') === '1';
  const admin = createAdminClient();
  const log: string[] = [];
  const accounts = emptyReport();
  const requests = emptyReport();
  let aborted: string | null = null;

  // ── 3. payout_accounts ───────────────────────────────────────────────────
  {
    const { count: total } = await admin
      .from('payout_accounts')
      .select('*', { count: 'exact', head: true });
    accounts.total = total ?? 0;

    const { count: done } = await admin
      .from('payout_accounts')
      .select('*', { count: 'exact', head: true })
      .not('secret_enc', 'is', null);
    accounts.alreadyEncrypted = done ?? 0;

    // Only un-migrated rows that still have a plaintext value to encrypt.
    const { data: rows, error } = await admin
      .from('payout_accounts')
      .select('user_id, card_number')
      .is('secret_enc', null)
      .not('card_number', 'is', null)
      .limit(BATCH);

    if (error) {
      return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
    }

    accounts.scanned = rows?.length ?? 0;
    log.push(`payout_accounts: ${accounts.total} total, ${accounts.alreadyEncrypted} already encrypted, ${accounts.scanned} in this batch`);

    for (const row of rows ?? []) {
      const pan = (row.card_number ?? '').replace(/\D/g, '');
      if (!pan) {
        accounts.failed += 1;
        aborted = `payout_accounts ${row.user_id}: empty card_number after normalisation`;
        break;
      }
      try {
        const { ciphertext, keyVersion } = encryptSecret({ card_number: pan });
        if (!dryRun) {
          const { error: upErr } = await admin
            .from('payout_accounts')
            .update({
              secret_enc: ciphertext,
              secret_last4: last4(pan),
              key_version: keyVersion,
              instrument_type: 'card',
            })
            .eq('user_id', row.user_id)
            .is('secret_enc', null); // concurrency-safe: never overwrite a migrated row
          if (upErr) {
            accounts.failed += 1;
            aborted = `payout_accounts ${row.user_id}: ${upErr.message}`;
            break;
          }
        }
        accounts.encrypted += 1;
      } catch (err) {
        accounts.failed += 1;
        aborted = `payout_accounts ${row.user_id}: encryption failed — ${err instanceof Error ? err.message : 'unknown'}`;
        break;
      }
    }

    const { count: left } = await admin
      .from('payout_accounts')
      .select('*', { count: 'exact', head: true })
      .is('secret_enc', null)
      .not('card_number', 'is', null);
    accounts.remaining = left ?? 0;
    log.push(`payout_accounts: encrypted ${accounts.encrypted}, failed ${accounts.failed}, remaining ${accounts.remaining}`);
  }

  // ── 4. payout_requests snapshots (historical payouts) ────────────────────
  // Only runs if accounts did not abort — an encryption fault must stop the run.
  if (!aborted) {
    const { count: total } = await admin
      .from('payout_requests')
      .select('*', { count: 'exact', head: true });
    requests.total = total ?? 0;

    const { count: done } = await admin
      .from('payout_requests')
      .select('*', { count: 'exact', head: true })
      .not('snap_secret_enc', 'is', null);
    requests.alreadyEncrypted = done ?? 0;

    const { data: rows, error } = await admin
      .from('payout_requests')
      .select('id, snap_card_number, snap_card_type')
      .is('snap_secret_enc', null)
      .not('snap_card_number', 'is', null)
      .limit(BATCH);

    if (error) {
      return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
    }

    requests.scanned = rows?.length ?? 0;
    log.push(`payout_requests: ${requests.total} total, ${requests.alreadyEncrypted} already encrypted, ${requests.scanned} in this batch`);

    for (const row of rows ?? []) {
      const pan = (row.snap_card_number ?? '').replace(/\D/g, '');
      if (!pan) {
        requests.failed += 1;
        aborted = `payout_requests ${row.id}: empty snap_card_number after normalisation`;
        break;
      }
      try {
        const { ciphertext, keyVersion } = encryptSecret({ card_number: pan });
        if (!dryRun) {
          // Snapshot columns ONLY. Historical amounts, commission, status and
          // dates are never touched — the payout record itself is immutable.
          const { error: upErr } = await admin
            .from('payout_requests')
            .update({
              snap_secret_enc: ciphertext,
              snap_secret_last4: last4(pan),
              snap_key_version: keyVersion,
              snap_instrument_type: 'card',
            })
            .eq('id', row.id)
            .is('snap_secret_enc', null);
          if (upErr) {
            requests.failed += 1;
            aborted = `payout_requests ${row.id}: ${upErr.message}`;
            break;
          }
        }
        requests.encrypted += 1;
      } catch (err) {
        requests.failed += 1;
        aborted = `payout_requests ${row.id}: encryption failed — ${err instanceof Error ? err.message : 'unknown'}`;
        break;
      }
    }

    const { count: left } = await admin
      .from('payout_requests')
      .select('*', { count: 'exact', head: true })
      .is('snap_secret_enc', null)
      .not('snap_card_number', 'is', null);
    requests.remaining = left ?? 0;
    log.push(`payout_requests: encrypted ${requests.encrypted}, failed ${requests.failed}, remaining ${requests.remaining}`);
  }

  const complete = !aborted && accounts.remaining === 0 && requests.remaining === 0;
  if (aborted) log.push(`ABORTED: ${aborted}`);
  log.push(complete ? 'BACKFILL COMPLETE — every plaintext row has ciphertext.' : 'Run again to continue.');

  return NextResponse.json(
    {
      ok: !aborted,
      dryRun,
      complete,
      aborted,
      accounts,
      requests,
      log,
    },
    { status: aborted ? 500 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
