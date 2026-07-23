// Shared constants + type for the saved-cards UI. Kept in a tiny NON-React module
// so DonationForm can import the choice value/type WITHOUT pulling the
// SavedCardSelector component code into the Checkout JS bundle (it is lazy-loaded
// and only fetched when the feature is on + the user has saved cards).

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
