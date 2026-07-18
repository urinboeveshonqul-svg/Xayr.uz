import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret, isPayoutCryptoConfigured, last4 } from '@/lib/payout-crypto';

export const runtime = 'nodejs';

/**
 * Save the caller's payout account (PHASE 1 — dual write).
 *
 * The card number can no longer be written directly from the browser to
 * PostgREST, because encryption happens in Node with a server-only key. This
 * route is the single write path: it authenticates, validates, encrypts, and
 * writes BOTH the plaintext column (still the read path in phase 1) and the new
 * encrypted payload.
 *
 * Ownership: the row is keyed on the authenticated user's own id — the client
 * cannot write another user's payout account, and `user_id` is never taken from
 * the request body.
 *
 * The PAN is never logged, never echoed back, and never stored anywhere but the
 * two columns below.
 */
const schema = z.object({
  full_legal_name: z.string().trim().min(3).max(120),
  phone_number: z.string().trim().min(5).max(20), // already E.164 from the client
  card_type: z.enum(['uzcard', 'humo']),
  // Optional: omitted when the owner edits an existing account without changing
  // the card. The stored (encrypted) card is then left untouched.
  card_number: z.string().regex(/^\d{16}$/, 'card_number must be 16 digits').optional(),
  cardholder_name: z.string().trim().min(2).max(120),
  bank_name: z.string().trim().max(120).nullable().optional(),
});

export async function POST(request: Request) {
  // 1) Authenticate — server-validated, never trusted from the body.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  // 2) Fail closed if the key is missing: storing plaintext-only in phase 1
  //    would silently skip encryption and the backfill would then miss the row.
  if (!isPayoutCryptoConfigured()) {
    console.error('[payouts/account] PAYOUT_ENCRYPTION_KEY not set — refusing to save.');
    return NextResponse.json({ error: 'encryption_unavailable' }, { status: 503 });
  }

  // 3) Validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 422 });
  }
  const acct = parsed.data;

  const admin = createAdminClient();

  // Non-sensitive fields are always written.
  const base = {
    full_legal_name: acct.full_legal_name,
    phone_number: acct.phone_number,
    card_type: acct.card_type,
    cardholder_name: acct.cardholder_name,
    bank_name: acct.bank_name?.trim() || null,
  };

  // ── No new card supplied → update the other fields only ──────────────────
  // Requires an existing account; the stored (encrypted) card is preserved.
  if (!acct.card_number) {
    const { data: existing } = await admin
      .from('payout_accounts')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'card_number_required' }, { status: 422 });
    }
    const { error } = await admin.from('payout_accounts').update(base).eq('user_id', user.id);
    if (error) {
      console.error('[payouts/account] update failed:', error.message);
      return NextResponse.json({ error: 'save_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // ── New card supplied → encrypt and dual-write ───────────────────────────
  // The payload is an object so future instruments (IBAN, bank account) reuse
  // this exact shape with no schema change.
  let ciphertext: string;
  let keyVersion: number;
  try {
    const enc = encryptSecret({ card_number: acct.card_number });
    ciphertext = enc.ciphertext;
    keyVersion = enc.keyVersion;
  } catch (err) {
    console.error('[payouts/account] encryption failed:', err);
    return NextResponse.json({ error: 'encryption_failed' }, { status: 500 });
  }

  const { error } = await admin.from('payout_accounts').upsert({
    user_id: user.id,
    ...base,
    // PHASE 2: still dual-writing. Phase 3 (#57) drops this column.
    card_number: acct.card_number,
    instrument_type: 'card',
    secret_enc: ciphertext,
    secret_last4: last4(acct.card_number),
    key_version: keyVersion,
  });

  if (error) {
    console.error('[payouts/account] save failed:', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
