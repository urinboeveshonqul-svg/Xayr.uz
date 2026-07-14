// ============================================================
// Payment provider CATALOG METADATA — pure data, client-safe.
// (No server imports: shared by the donation form, the success
// page, and the server-side catalog resolver.)
//
// Adding a future provider = add one entry here + implement its
// PaymentProvider in lib/payments/providers/ + enable it in the
// admin settings (payment_provider_settings). No UI redesign.
// ============================================================

/** Sub-methods a provider can offer inside its own card (never shown as separate providers). */
export type PaymentSubmethod = 'wallet' | 'card';

export interface PaymentProviderMeta {
  id: string;
  /** Brand display name (not translated — brand names stay as-is). */
  name: string;
  /** Short brand mark for the logo chip (no external images — CSP-safe). */
  logo: { initial: string; className: string };
  /** Sub-methods offered inside this provider's card. */
  supportedMethods: PaymentSubmethod[];
  /** Sort order when the admin settings table has no row yet. */
  defaultPriority: number;
}

/** Every provider the platform plans to offer, in default display order. */
export const PROVIDER_META: PaymentProviderMeta[] = [
  {
    id: 'click',
    name: 'CLICK',
    logo: { initial: 'C', className: 'bg-sky-600 text-white' },
    supportedMethods: ['wallet', 'card'],
    defaultPriority: 10,
  },
  {
    id: 'payme',
    name: 'Payme',
    logo: { initial: 'P', className: 'bg-cyan-500 text-white' },
    supportedMethods: ['wallet', 'card'],
    defaultPriority: 20,
  },
  {
    id: 'paynet',
    name: 'Paynet',
    logo: { initial: 'P', className: 'bg-orange-500 text-white' },
    supportedMethods: ['wallet'],
    defaultPriority: 30,
  },
  {
    id: 'uzum',
    name: 'Uzum Bank',
    logo: { initial: 'U', className: 'bg-purple-600 text-white' },
    supportedMethods: ['wallet', 'card'],
    defaultPriority: 40,
  },
];

export const PROVIDER_IDS = PROVIDER_META.map((p) => p.id);

export function providerMeta(id: string): PaymentProviderMeta | undefined {
  return PROVIDER_META.find((p) => p.id === id);
}

/** Display name for a provider id (used e.g. on the payment-success receipt). */
export function providerDisplayName(id: string | null | undefined): string | null {
  if (!id) return null;
  return providerMeta(id)?.name ?? null;
}

/**
 * Serializable provider entry the server passes to client components — the
 * single source of provider availability for the UI (loaded server-side once,
 * never duplicated in client code).
 */
export interface PaymentProviderOption {
  id: string;
  name: string;
  logo: { initial: string; className: string };
  methods: PaymentSubmethod[];
  /** Selectable right now (implemented + configured + admin-enabled). */
  enabled: boolean;
  /** Visible but not selectable — "Coming Soon" badge. */
  comingSoon: boolean;
  /** Admin-designated default → pre-selected + "Recommended" badge. */
  recommended: boolean;
}
