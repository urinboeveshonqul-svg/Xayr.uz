// ============================================================
// Payout helpers — card formatting/validation/masking + the configurable
// minimum. Isomorphic (no client/server-only deps) so the settings form, the
// withdrawal form and the admin page share one source of truth.
//
// Never handles CVV / PIN / expiry — only the card number for manual transfer.
// ============================================================

import type { CardType } from '@/types';

/**
 * Configurable minimum withdrawal (so'm). MUST stay in sync with v_min in
 * create_payout_request() — the server is authoritative. Lowered from 50000 to
 * 5000 by migration #60 (supabase/withdrawal-minimum-5000.sql); the maximum is
 * always the campaign's available balance (enforced server-side by the
 * `amount_exceeds_available` guard), never a hardcoded value.
 */
export const MIN_WITHDRAWAL = 5000;

/**
 * Platform commission, charged to the CREATOR at withdrawal time only.
 * Donors are never charged: nothing in the donation flow reads these.
 *
 * ⚠️ DISPLAY ONLY. The authoritative fee is computed inside
 * create_payout_request() (SECURITY DEFINER) and stored on the row, because
 * clients have no insert/update policy on payout_requests. These constants exist
 * so the preview the creator sees matches what the server will charge — they
 * MUST stay in sync with v_commission in supabase/payout-commission-4pct.sql (#51).
 *
 * NEVER use these to re-derive the fee for an EXISTING request. Historical rows
 * hold the rate that was actually charged (0% pre-#26, 3% for #26..#50), and the
 * DB CHECK `commission_amount + payout_amount = amount` guarantees they
 * reconcile. Recomputing would show users a fee that was never taken. Always
 * read commission_amount / payout_amount from the row.
 */
export const PLATFORM_FEE_RATE = 0.04;

/** The same rate as a whole number, for UI copy ("Platform fee (4%)"). */
export const PLATFORM_FEE_PERCENT = 4;

/**
 * Preview the commission for a NEW withdrawal of `amount` so'm.
 * Mirrors the server's `round(p_amount * 0.04)` exactly.
 */
export function calcPlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_FEE_RATE);
}

/**
 * Preview the NET a creator receives for a NEW GROSS withdrawal of `amount` so'm.
 * The creator ALWAYS enters the gross; this is what the admin then transfers.
 * Forward direction only (gross → net); there is no net → gross conversion.
 */
export function calcNetPayout(amount: number): number {
  return amount - calcPlatformFee(amount);
}

/**
 * Statuses whose gross is committed against the campaign balance. MUST match
 * the status list inside campaign_available_balance() (supabase/payouts.sql) —
 * active requests reserve funds; paid requests have left; rejected/cancelled
 * release them.
 */
export const COMMITTED_STATUSES = ['pending_review', 'approved', 'info_requested', 'paid'] as const;

/**
 * THE ONE "Available to withdraw" calculation for the whole app — mirror of
 * campaign_available_balance(): the max GROSS the creator can request today =
 * completed-donation total − Σ gross of committed requests. This is the amount
 * shown as "Available to withdraw" and used as the withdrawal-form ceiling; the
 * creator enters a gross amount against it. The DB function is authoritative
 * (re-checked inside create_payout_request); this mirror keeps every page
 * deriving the number the same way.
 */
export function calcAvailableGross(
  currentAmount: number,
  requests: { status: string; amount: number }[]
): number {
  const committed = requests
    .filter((r) => (COMMITTED_STATUSES as readonly string[]).includes(r.status))
    .reduce((sum, r) => sum + r.amount, 0);
  return Math.max(0, (currentAmount ?? 0) - committed);
}

export interface PayoutBreakdown {
  /** Gross requested — the amount that leaves the campaign balance. */
  gross: number;
  /** Platform fee actually charged on THIS request (stored, not re-derived). */
  fee: number;
  /**
   * Net the creator receives AND the exact amount the admin must transfer.
   * fee + net === gross (guaranteed by the DB CHECK commission+payout=amount).
   */
  net: number;
  /** Effective fee rate for THIS row as a whole percent (0/3/4…), for labels. */
  ratePercent: number;
}

/**
 * THE single source of truth for reading a STORED payout request's three
 * figures. Every surface that shows a submitted/approved/paid withdrawal —
 * creator history, the withdrawal-confirmation, the admin review page — MUST
 * read gross/fee/net through here so no screen can contradict another.
 *
 * It reads the values stored at request time and NEVER re-derives the fee for an
 * existing row: the rate has changed over time (0% pre-#26, 3% for #26..#50, 4%
 * from #51), so recomputing would misstate money that already moved. The DB
 * CHECK `commission_amount + payout_amount = amount` guarantees the three
 * reconcile. For a NEW request preview use calcPlatformFee / calcNetPayout
 * (mirror of the server's round(amount*0.04)); those agree with this because the
 * server stores exactly what they compute.
 */
export function payoutBreakdown(row: {
  amount: number;
  commission_amount?: number | null;
  payout_amount?: number | null;
}): PayoutBreakdown {
  const gross = row.amount ?? 0;
  const fee = row.commission_amount ?? 0;
  const net = row.payout_amount ?? Math.max(0, gross - fee);
  const ratePercent = gross > 0 ? Math.round((fee / gross) * 100) : 0;
  return { gross, fee, net, ratePercent };
}

export const CARD_TYPES: { value: CardType; label: string }[] = [
  { value: 'uzcard', label: 'UzCard' },
  { value: 'humo', label: 'Humo' },
];

export function cardTypeLabel(t?: string | null): string {
  if (t === 'humo') return 'Humo';
  if (t === 'uzcard') return 'UzCard';
  return '—';
}

/** Keep only digits, capped at 16 (handles paste with spaces/dashes). */
export function cardDigits(input: string): string {
  return (input || '').replace(/\D/g, '').slice(0, 16);
}

/** Format digits as "1234 5678 9012 3456" for input display. */
export function formatCard(digits: string): string {
  return cardDigits(digits).replace(/(.{4})(?=.)/g, '$1 ');
}

/** A complete card number is exactly 16 digits. */
export function isValidCard(digits: string): boolean {
  return /^\d{16}$/.test(cardDigits(digits));
}

/** Masked card for non-internal display: "•••• •••• •••• 3456". */
export function maskCard(cardNumber?: string | null): string {
  const d = (cardNumber || '').replace(/\D/g, '');
  if (d.length < 4) return '••••';
  return `•••• •••• •••• ${d.slice(-4)}`;
}

/**
 * Card mask for the OWNER's read-only payout card: keeps the issuer BIN (first
 * 4 digits — the public card-scheme prefix, not sensitive) and the last 4,
 * hiding the middle 8: "8600 **** **** 9012". Creator-facing only; admins still
 * see the full PAN in the admin payout dashboard. Falls back to maskCard() when
 * there aren't enough digits to show a BIN.
 */
export function maskCardDisplay(cardNumber?: string | null): string {
  const d = (cardNumber || '').replace(/\D/g, '');
  if (d.length < 8) return maskCard(cardNumber);
  return `${d.slice(0, 4)} **** **** ${d.slice(-4)}`;
}
