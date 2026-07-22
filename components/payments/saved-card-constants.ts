// Shared constants + type for the saved-cards UI. Kept in a tiny NON-React module
// so DonationForm can import the choice values/type WITHOUT pulling the
// SavedCardSelector / AddCardFlow component code into the Checkout JS bundle
// (those are lazy-loaded and only fetched when the feature is on + rendered).

export const CHOICE_ADD = '__add__';
export const CHOICE_CHECKOUT = '__checkout__';

export interface SavedCardDisplay {
  id: string;
  card_brand: 'uzcard' | 'humo' | null;
  last4: string | null;
  card_holder?: string | null;
  is_default?: boolean;
}
