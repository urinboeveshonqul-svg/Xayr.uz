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

/** Preview the net a creator receives for a NEW withdrawal of `amount` so'm. */
export function calcNetPayout(amount: number): number {
  return amount - calcPlatformFee(amount);
}

/**
 * Invert the server's fee formula: the smallest GROSS whose net payout is
 * exactly `net` so'm.
 *
 * The creator-facing UI works entirely in NET so'm ("Available to withdraw",
 * the amount input, "you receive" — all the same number), but the DB keeps its
 * gross semantics: create_payout_request() receives a gross, deducts it from
 * the balance and stores payout = gross − round(gross × 0.04). This function is
 * the bridge: because net(g) = g − round(g·0.04) increases by exactly 0 or 1
 * per so'm of gross, every net value is reachable, so the amount the creator
 * types is the amount the server will pay — to the so'm, with no drift between
 * the preview and the stored row.
 *
 * Picking the SMALLEST such gross means that when two grosses yield the same
 * net (a rounding boundary), the creator is charged the lower fee.
 */
export function grossForNet(net: number): number {
  const n = Math.floor(net);
  if (!Number.isFinite(n) || n <= 0) return 0;
  let g = Math.round(n / (1 - PLATFORM_FEE_RATE));
  while (calcNetPayout(g) > n) g -= 1;
  while (calcNetPayout(g) < n) g += 1;
  while (g > 0 && calcNetPayout(g - 1) === n) g -= 1;
  return g;
}

/**
 * The minimum the creator can type in NET so'm. Deliberately the same round
 * 5,000 the platform documents everywhere (legal pages, guides) rather than the
 * exact net of the server's gross minimum (4,800) — a clean, familiar number
 * beats a technically-derived odd one on a trust surface. Strictly SAFE: any
 * net ≥ 5,000 converts to a gross ≥ grossForNet(5000) = 5,208 ≥ the server's
 * 5,000 gross guard, so `below_minimum` can never fire for a client-accepted
 * amount (asserted in __tests__/payout.test.ts).
 */
export const MIN_WITHDRAWAL_NET = MIN_WITHDRAWAL;

/**
 * Statuses whose gross is committed against the campaign balance. MUST match
 * the status list inside campaign_available_balance() (supabase/payouts.sql) —
 * active requests reserve funds; paid requests have left; rejected/cancelled
 * release them.
 */
export const COMMITTED_STATUSES = ['pending_review', 'approved', 'info_requested', 'paid'] as const;

/**
 * Mirror of campaign_available_balance(): the max GROSS that can leave the
 * balance today = completed-donation total − Σ gross of committed requests.
 * The DB function is authoritative (re-checked inside create_payout_request);
 * this mirror exists so every page derives the number the same way.
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
