// Shared constants + type for the saved-cards UI. Kept in a tiny NON-React module
// so DonationForm can import the choice value/type WITHOUT pulling the
// SavedCardSelector component code into the Checkout JS bundle (it is lazy-loaded
// and only fetched when the feature is on + the user has saved cards).

/**
 * ⛔ MASTER KILL SWITCH — saved cards / tokenization are TEMPORARILY DISABLED
 * (2026-07-23) while the embedded Click Checkout JS popup is being debugged.
 *
 * While `true`:
 *   • the donation form NEVER renders the saved-card chooser (always the plain
 *     PaymentMethodSelector → normal Checkout JS flow),
 *   • no request is made to /api/account/cards,
 *   • payWithSavedCard() is unreachable,
 *   • automatic card-token saving in the Click callback is skipped,
 *   • /profile/cards returns 404.
 *
 * NOTHING is deleted — every saved-card/tokenization module stays in the tree.
 * TO RESTORE: flip this single constant to `false` (the feature then obeys
 * NEXT_PUBLIC_CLICK_SAVED_CARDS again, exactly as before).
 */
export const SAVED_CARDS_DISABLED = true;

// Cards are saved AUTOMATICALLY after a successful donation (see
// lib/payments/save-card-token.ts) — there is no manual "add a card" flow. The
// donation-form chooser therefore offers only saved cards + "Use another card".
export const CHOICE_CHECKOUT = '__checkout__';

export interface SavedCardDisplay {
  id: string;
  card_brand: 'uzcard' | 'humo' | null;
  last4: string | null;
  card_holder?: string | null;
  is_default?: boolean;
}
