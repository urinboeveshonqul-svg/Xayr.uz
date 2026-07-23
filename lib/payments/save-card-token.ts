import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken, isTokenCipherConfigured } from '@/lib/crypto/token-cipher';

/**
 * Automatic Click card-token saving — runs AFTER a donation is confirmed.
 *
 * Users never explicitly "save a card". If Click returns a reusable card token
 * alongside a successful payment, we persist it here and associate it with the
 * authenticated donor; if not, nothing happens and the donation is unaffected.
 *
 * HARD GUARANTEE: this NEVER throws and NEVER blocks a donation. Every failure is
 * caught, logged, and swallowed — token saving is strictly best-effort. It reuses
 * the existing `saved_payment_methods` schema + `token-cipher`; no payment or
 * confirmation logic is duplicated. The service-role callback can't use the
 * `save_card` RPC (it needs the caller's auth.uid()), so it inserts directly —
 * the service role bypasses RLS + column grants for exactly this backend path.
 */

export interface ReusableCardToken {
  /** The reusable/persistent Click card token. */
  token: string;
  cardBrand?: 'uzcard' | 'humo' | null;
  last4?: string | null;
  cardHolder?: string | null;
}

/**
 * Extract a reusable token from a Click SHOP callback body, if present. Read from
 * the raw form (NOT the parsed+logged params) so the token never lands in
 * payment_events. Returns null unless Click actually sent a `card_token`.
 */
export function clickReusableToken(form: FormData): ReusableCardToken | null {
  const token = form.get('card_token');
  if (typeof token !== 'string' || token.length === 0) return null;

  const type = form.get('card_type');
  const brand = type === 'uzcard' || type === 'humo' ? type : null;
  const pan = form.get('card_number'); // Click may send a masked PAN
  const last4 = typeof pan === 'string' && /\d{4}$/.test(pan.trim()) ? pan.trim().slice(-4) : null;

  return { token, cardBrand: brand, last4, cardHolder: null };
}

/**
 * Persist a reusable Click token for the donor of `reference` (its payment_ref).
 * No-ops silently when: no token, cipher unconfigured, a guest donation (no user),
 * or the same card (brand+last4) is already saved for that user.
 */
export async function saveDonationCardToken(
  reference: string,
  card: ReusableCardToken | null
): Promise<void> {
  try {
    if (!card?.token || !isTokenCipherConfigured()) return;

    const admin = createAdminClient();

    const { data: donation } = await admin
      .from('donations')
      .select('donor_id')
      .eq('payment_ref', reference)
      .maybeSingle();
    const donorId = donation?.donor_id;
    if (!donorId) return; // guest donation → no user to associate the card with

    const brand = card.cardBrand ?? null;
    const last4 = card.last4 ?? null;

    const { data: existing } = await admin
      .from('saved_payment_methods')
      .select('id, card_brand, last4')
      .eq('user_id', donorId)
      .eq('is_active', true);
    const rows = existing ?? [];

    // Already saved (same brand + last4) → nothing to do (avoids duplicates when
    // a returning donor pays with the same card again).
    if (last4 && rows.some((c) => c.last4 === last4 && c.card_brand === brand)) return;

    const { ciphertext, version } = encryptToken(card.token);
    const { error } = await admin.from('saved_payment_methods').insert({
      user_id: donorId,
      provider: 'click',
      token_ciphertext: ciphertext,
      enc_version: version,
      token_id: null,
      card_brand: brand,
      last4,
      card_holder: card.cardHolder ?? null,
      is_default: rows.length === 0, // first active card becomes the default
      is_active: true,
    });
    if (error) throw new Error(error.message);

    console.log('[save-card-token] auto-saved a Click card token after donation', reference);
  } catch (err) {
    // NEVER block the donation — log and swallow.
    console.error(
      '[save-card-token] auto-save failed (donation unaffected):',
      err instanceof Error ? err.message : 'unknown'
    );
  }
}
