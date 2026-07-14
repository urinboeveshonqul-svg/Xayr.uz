import { createAdminClient } from '@/lib/supabase/admin';
import { isClickConfigured } from './providers/click';
import {
  PROVIDER_META,
  type PaymentProviderOption,
  type PaymentSubmethod,
} from './providers-meta';

// ============================================================
// Payment provider catalog — SERVER-ONLY resolver.
//
// Merges three layers into one availability answer, so provider
// availability is never hardcoded in more than one place:
//   1. code       — is a PaymentProvider implemented? (this file)
//   2. env        — are its merchant credentials configured?
//   3. admin      — payment_provider_settings row (enable/disable,
//                   coming-soon, display order, default) — migration
//                   #47; editable from /admin/payments, no code change.
//
// Fails open to safe defaults when the settings table doesn't exist
// yet (pre-migration): Click live when configured, others Coming Soon.
// ============================================================

/** Providers with a real PaymentProvider implementation + their env check. */
const IMPLEMENTED: Record<string, () => boolean> = {
  click: isClickConfigured,
};

interface ProviderSettingsRow {
  id: string;
  enabled: boolean;
  coming_soon: boolean;
  priority: number;
  is_default: boolean;
}

/** Resolved catalog entry (admin view — includes the why, not just the what). */
export interface PaymentCatalogEntry extends PaymentProviderOption {
  /** A PaymentProvider implementation exists in code. */
  implemented: boolean;
  /** Merchant credentials are present in the environment. */
  configured: boolean;
  /** Raw admin flags (what the settings row says, before resolution). */
  adminEnabled: boolean;
  adminComingSoon: boolean;
  priority: number;
}

async function fetchSettings(): Promise<Map<string, ProviderSettingsRow> | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('payment_provider_settings')
      .select('id, enabled, coming_soon, priority, is_default');
    if (error || !data) return null; // table missing / unreachable → defaults
    return new Map(data.map((r) => [r.id, r as ProviderSettingsRow]));
  } catch {
    return null;
  }
}

/**
 * Resolve the full provider catalog (sorted by display priority).
 *
 * Resolution per provider:
 *   selectable (enabled) = admin-enabled AND NOT coming-soon AND implemented AND configured
 *   coming soon          = flagged by admin, OR admin-enabled but not yet operational
 *   hidden               = admin-disabled without the coming-soon flag
 */
export async function getPaymentCatalog(): Promise<PaymentCatalogEntry[]> {
  const settings = await fetchSettings();

  const entries = PROVIDER_META.map((meta) => {
    const s = settings?.get(meta.id) ?? null;
    const implemented = meta.id in IMPLEMENTED;
    const configured = implemented && IMPLEMENTED[meta.id]();
    const operational = implemented && configured;

    // Defaults (no settings row): Click is meant to be live; the rest are planned.
    const adminEnabled = s ? s.enabled : meta.id === 'click';
    const adminComingSoon = s ? s.coming_soon : meta.id !== 'click';

    const enabled = adminEnabled && !adminComingSoon && operational;
    // Fail safe: an admin-enabled provider that can't actually charge
    // (no code / no credentials) is presented as Coming Soon, never selectable.
    const comingSoon = !enabled && (adminComingSoon || (adminEnabled && !operational));

    return {
      id: meta.id,
      name: meta.name,
      logo: meta.logo,
      methods: meta.supportedMethods as PaymentSubmethod[],
      enabled,
      comingSoon,
      recommended: (s ? s.is_default : meta.id === 'click') && enabled,
      implemented,
      configured,
      adminEnabled,
      adminComingSoon,
      priority: s?.priority ?? meta.defaultPriority,
    };
  });

  return entries.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

/** Donor-facing options: visible providers only, serializable for client components. */
export function toProviderOptions(catalog: PaymentCatalogEntry[]): PaymentProviderOption[] {
  return catalog
    .filter((e) => e.enabled || e.comingSoon)
    .map(({ id, name, logo, methods, enabled, comingSoon, recommended }) => ({
      id, name, logo, methods, enabled, comingSoon, recommended,
    }));
}

/** Server-side check used by the donations API — never trust the client's method. */
export async function isProviderEnabled(id: string): Promise<boolean> {
  const catalog = await getPaymentCatalog();
  return catalog.some((e) => e.id === id && e.enabled);
}
