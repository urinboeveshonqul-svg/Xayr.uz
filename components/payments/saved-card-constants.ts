// Shared constants + type for the saved-cards UI. Kept in a tiny NON-React module
// so DonationForm can import the choice values/type WITHOUT pulling the
// SavedCardSelector / AddCardFlow component code into the Checkout JS bundle
// (those are lazy-loaded and only fetched when the feature is on + rendered).

export const CHOICE_ADD = '__add__';
export const CHOICE_CHECKOUT = '__checkout__';

/**
 * TEMPORARY (2026-07-23): registering a NEW card — Click's Card Token SMS-OTP
 * enrolment (`card_token/request` + `verify`) — is disabled because that flow is
 * not working reliably. This gates ONLY new-card enrolment; nothing else about
 * saved cards changes:
 *   • existing saved cards can still be selected and charged,
 *   • one-time Checkout JS payments, donations and confirmation are untouched.
 * Off by default. Re-enable by setting `NEXT_PUBLIC_CLICK_CARD_REGISTRATION=1`
 * (the enrolment code is fully preserved behind this flag). Read on the client
 * AND the server — the value is inlined at build for NEXT_PUBLIC_* vars.
 */
export function isCardRegistrationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CLICK_CARD_REGISTRATION === '1';
}

export interface SavedCardDisplay {
  id: string;
  card_brand: 'uzcard' | 'humo' | null;
  last4: string | null;
  card_holder?: string | null;
  is_default?: boolean;
}
