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
 * create_payout_request() (supabase/payout-info.sql) — the server is authoritative.
 */
export const MIN_WITHDRAWAL = 50000;

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

// NOTE: maskCard() / maskCardDisplay() were removed in phase 3A. They took a
// full PAN as input, which no longer exists at rest — card numbers are stored
// only as ciphertext and the last 4 digits are persisted separately. Use the
// *FromLast4 helpers below, which never handle a PAN.

/**
 * Masked card built from the stored last-4 ALONE — "•••• •••• •••• 3456".
 *
 * Preferred over maskCard() now that card numbers are encrypted: the caller
 * never needs (and never sees) the PAN. The BIN is not shown because it is not
 * stored separately; only the last 4 is retained in clear.
 */
export function maskFromLast4(last4?: string | null): string {
  const d = (last4 || '').replace(/\D/g, '').slice(-4);
  if (!d) return '••••';
  return `•••• •••• •••• ${d}`;
}

/** Same, in the owner's read-only card layout. */
export function maskDisplayFromLast4(last4?: string | null): string {
  const d = (last4 || '').replace(/\D/g, '').slice(-4);
  if (!d) return '••••';
  return `**** **** **** ${d}`;
}
