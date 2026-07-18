import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret } from '@/lib/payout-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Audited admin reveal of a payout card number.
 *
 * This is the ONLY path by which a full PAN reaches a browser, and it exists
 * because payouts are executed as manual bank transfers — a human has to read
 * the number. Everything else (lists, page payloads, the creator UI) shows only
 * the masked last-4.
 *
 * Controls:
 *  • POST only, admin verified SERVER-SIDE via the session (never the body).
 *  • Decryption happens only here, with the server-only key.
 *  • EVERY reveal writes an admin_audit_log row: admin id, timestamp (default
 *    now()), the payout request id, and the optional reason — written BEFORE the
 *    PAN is returned, so a reveal can never be un-logged.
 *  • Response is Cache-Control: no-store (never cached by the browser or a CDN).
 *  • The PAN is never logged server-side and never persisted anywhere.
 *
 * Phase 2: falls back to the legacy plaintext snapshot when a historical row has
 * not been backfilled yet. Phase 3 removes that fallback with the column.
 */
const schema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 });
  }

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
  const { requestId, reason } = parsed.data;

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from('payout_requests')
    .select('id, snap_secret_enc, snap_key_version, snap_card_number, snap_secret_last4')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'request_not_found' }, { status: 404 });
  }

  // Resolve the PAN: encrypted first, legacy plaintext only as a phase-2 fallback.
  let cardNumber: string | null = null;
  let source: 'encrypted' | 'legacy_plaintext' = 'encrypted';
  if (row.snap_secret_enc) {
    try {
      const payload = decryptSecret(row.snap_secret_enc, row.snap_key_version ?? 1);
      cardNumber = payload.card_number ?? null;
    } catch (err) {
      // Wrong key, tampered ciphertext, or a truncated envelope. Never fall
      // through to plaintext on a decrypt FAILURE — that would mask a real
      // integrity problem. Fail loudly instead.
      console.error('[payouts/reveal] decrypt failed for request', requestId, err);
      return NextResponse.json({ error: 'decrypt_failed' }, { status: 500 });
    }
  } else if (row.snap_card_number) {
    cardNumber = row.snap_card_number;
    source = 'legacy_plaintext';
  }

  if (!cardNumber) {
    return NextResponse.json({ error: 'no_card_on_record' }, { status: 404 });
  }

  // Audit BEFORE returning the value — a reveal is never un-logged.
  const { error: auditErr } = await admin.from('admin_audit_log').insert({
    admin_id: user.id,
    action: 'payout_card_reveal',
    entity_type: 'payout_request',
    entity_id: requestId,
    meta: {
      source,
      last4: row.snap_secret_last4 ?? cardNumber.slice(-4),
      ...(reason ? { reason } : {}),
    },
  });
  if (auditErr) {
    // If the reveal cannot be audited, it does not happen.
    console.error('[payouts/reveal] audit write failed:', auditErr.message);
    return NextResponse.json({ error: 'audit_failed' }, { status: 500 });
  }

  return NextResponse.json(
    { cardNumber },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
  );
}
