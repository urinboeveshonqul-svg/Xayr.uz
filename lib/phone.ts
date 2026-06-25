// ============================================================
// Phone number helpers. Isomorphic (no client/server-only deps) so the KYC
// form and the verification API can share one source of truth.
//
// Designed to add more countries later WITHOUT refactoring: describe a country
// once in PhoneCountry and every helper (format, validate, E.164) adapts.
// ============================================================

export interface PhoneCountry {
  iso: string;
  /** International dial code incl. '+', e.g. '+998'. */
  dialCode: string;
  /** Number of national digits expected after the dial code, e.g. 9. */
  nationalDigits: number;
  /** Display grouping of the national digits, e.g. [2,3,2,2] → "90 123 45 67". */
  groups: number[];
  /** Example national number (used as the input placeholder). */
  example: string;
}

/** Uzbekistan (+998, 9 national digits). The default country today. */
export const UZ: PhoneCountry = {
  iso: 'UZ',
  dialCode: '+998',
  nationalDigits: 9,
  groups: [2, 3, 2, 2],
  example: '90 123 45 67',
};

/** Bare dial-code digits, e.g. '+998' → '998'. */
function dialDigits(c: PhoneCountry): string {
  return c.dialCode.replace(/\D/g, '');
}

/**
 * Extract the NATIONAL digits from arbitrary input. Strips spaces, dashes,
 * parentheses, letters — anything non-numeric (so paste "just works"). If the
 * pasted value already includes the country code (e.g. "+998 90 123 45 67" or
 * "998901234567"), the leading dial code is removed. Capped at nationalDigits.
 */
export function nationalDigitsFrom(input: string, c: PhoneCountry = UZ): string {
  let d = (input || '').replace(/\D/g, '');
  const cc = dialDigits(c);
  if (d.length > c.nationalDigits && d.startsWith(cc)) {
    d = d.slice(cc.length);
  }
  return d.slice(0, c.nationalDigits);
}

/** Format national digits for display, e.g. "901234567" → "90 123 45 67". */
export function formatNational(digits: string, c: PhoneCountry = UZ): string {
  const d = digits.slice(0, c.nationalDigits);
  const parts: string[] = [];
  let i = 0;
  for (const g of c.groups) {
    if (i >= d.length) break;
    parts.push(d.slice(i, i + g));
    i += g;
  }
  return parts.join(' ');
}

/** True when the national part has exactly the required number of digits. */
export function isValidNational(digits: string, c: PhoneCountry = UZ): boolean {
  return new RegExp(`^\\d{${c.nationalDigits}}$`).test(digits);
}

/** Build the E.164 value, e.g. '901234567' → '+998901234567'. */
export function toE164(digits: string, c: PhoneCountry = UZ): string {
  return `${c.dialCode}${digits}`;
}

/** Server-side E.164 validator for a country, e.g. matches '+998901234567'. */
export function isValidE164(value: string, c: PhoneCountry = UZ): boolean {
  return new RegExp(`^\\+${dialDigits(c)}\\d{${c.nationalDigits}}$`).test(value || '');
}
