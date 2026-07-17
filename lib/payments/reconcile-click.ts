import { createAdminClient } from '@/lib/supabase/admin';
import { notifyAdminsOfPaymentIssue } from './helpers';
import { isClickMerchantConfigured, lookupPaymentByMti } from './providers/click-merchant';

// ============================================================
// Click payment reconciliation — the safety net for audit F-1. SERVER-ONLY.
//
// Resolves the failure mode where a card was captured at Click but the donation
// stays 'pending' (e.g. an embedded checkout.js payment whose SHOP-API callback
// did not fire, or any redirect callback lost to a network fault).
//
// For every Click donation still 'pending' past a grace window, it asks the
// Merchant API whether Click actually has a payment on record. If it does, the
// donation is a captured-but-pending case: an admin is alerted and an audit row
// is written, ONCE, so it can never sit silently pending forever.
//
// SAFETY (see click-merchant.ts): it NEVER auto-completes and NEVER auto-fails a
// donation. The Merchant status endpoints return no captured amount, so an
// auto-credit could not verify against a tampered checkout.js amount — crediting
// stays exclusively on the amount-verified SHOP-API-callback → confirmDonation
// path. This job only DETECTS and SURFACES. Abandoned (never-paid) donations are
// left pending, which is harmless: pending never counts toward any total or
// balance.
//
// Fully additive and env-gated: inert unless CLICK_MERCHANT_USER_ID is set, so
// the redirect flow, Payme, donation creation, callbacks, RLS, balances and
// refunds are all untouched.
// ============================================================

const GRACE_MINUTES = 15; // give the normal callback time to finalize first
const LOOKBACK_DAYS = 3; // don't chase ancient abandoned checkouts forever
const MAX_PER_RUN = 200; // bound the work per cron invocation

export interface ReconcileResult {
  skipped?: boolean;
  scanned: number;
  captured: number; // captured-but-pending detected + alerted this run
  alreadyFlagged: number; // captured-but-pending already alerted on a prior run
}

/** YYYY-MM-DD in UTC (Click's status_by_mti path segment). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function reconcilePendingClickPayments(): Promise<ReconcileResult> {
  if (!isClickMerchantConfigured()) {
    return { skipped: true, scanned: 0, captured: 0, alreadyFlagged: 0 };
  }

  const admin = createAdminClient();
  const now = Date.now();
  const notBefore = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString();
  const notAfter = new Date(now - GRACE_MINUTES * 60_000).toISOString();

  // Pending Click donations in the [lookback, grace] age window. payment_ref
  // 'click_<uuid>' is exactly the merchant_trans_id Click knows the order by.
  const { data: rows, error } = await admin
    .from('donations')
    .select('id, payment_ref, amount, created_at')
    .eq('status', 'pending')
    .like('payment_ref', 'click_%')
    .gte('created_at', notBefore)
    .lte('created_at', notAfter)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error || !rows || rows.length === 0) {
    return { scanned: 0, captured: 0, alreadyFlagged: 0 };
  }

  let captured = 0;
  let alreadyFlagged = 0;

  for (const d of rows) {
    const ref = d.payment_ref as string;
    const created = new Date(d.created_at as string);

    // A payment usually posts the same day; also try today in case it completed
    // just after midnight relative to creation.
    const dates = [...new Set([ymd(created), ymd(new Date(now))])];
    let found: { paymentId?: number } | null = null;
    for (const date of dates) {
      const r = await lookupPaymentByMti(ref, date);
      if (r.paymentFound) {
        found = { paymentId: r.paymentId };
        break;
      }
      // r.ok === false (transient) → leave for next run; r.ok true & not found →
      // no payment on that date. Either way, do NOT fail the donation.
    }
    if (!found) continue;

    // Captured-but-pending. Alert exactly once: a reconcile marker row in
    // payment_events dedupes via its unique (provider, provider_event_id) index.
    const eventKey = `reconcile:${ref}`;
    const { data: existing } = await admin
      .from('payment_events')
      .select('id')
      .eq('provider', 'click')
      .eq('provider_event_id', eventKey)
      .maybeSingle();

    if (existing) {
      alreadyFlagged += 1;
      continue;
    }

    const { error: insErr } = await admin.from('payment_events').insert({
      provider: 'click',
      provider_event_id: eventKey,
      payment_ref: ref,
      donation_id: d.id,
      status: 'pending',
      amount: d.amount,
      currency: 'UZS',
      raw_payload: { reconcile: true, click_payment_id: found.paymentId ?? null },
      signature_valid: null,
      processed: false,
      error_message: 'captured_but_pending: Click reports a payment; donation still pending. Manual verify/complete or refund.',
    });
    // A concurrent run may have inserted first (unique-index conflict) — that's
    // fine, it means the alert already went out; just don't double-notify.
    if (insErr) {
      alreadyFlagged += 1;
      continue;
    }

    await notifyAdminsOfPaymentIssue({
      title: "To'lov tekshiruvi kerak",
      body: `Click to'lovi qayd etilgan, ammo xayriya hali 'pending'. Ref: ${ref}. Admin panelda tekshirib, qo'lda yakunlang yoki qaytaring.`,
      link: '/admin/donations',
    });
    captured += 1;
  }

  return { scanned: rows.length, captured, alreadyFlagged };
}
