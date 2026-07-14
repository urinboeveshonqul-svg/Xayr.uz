import type { PaymentProvider, PaymentProviderId } from './types';
import { manualProvider } from './providers/manual';
import { clickProvider, isClickConfigured } from './providers/click';
import { paymeProvider, isPaymeConfigured } from './providers/payme';

// Provider registry. Real gateways register here when their merchant
// credentials are configured; without credentials everything falls back to the
// manual (no-gateway) provider, preserving pre-gateway behaviour.
//   click — live (env-gated). Callbacks: app/api/payments/click.
//   payme — live (env-gated). Merchant API: app/api/payments/payme.
// Resolved per call (not at module init) so the env is always the runtime env,
// never a build-time snapshot.
function getProviders(): Partial<Record<PaymentProviderId, PaymentProvider>> {
  return {
    manual: manualProvider,
    ...(isClickConfigured() ? { click: clickProvider } : {}),
    ...(isPaymeConfigured() ? { payme: paymeProvider } : {}),
  };
}

/**
 * Resolve the provider for a chosen donation method. Methods without a
 * registered (configured) provider fall back to the manual provider.
 */
export function getPaymentProvider(method?: string | null): PaymentProvider {
  const providers = getProviders();
  if (method && method in providers) {
    return providers[method as PaymentProviderId] ?? manualProvider;
  }
  return manualProvider;
}

// Donor-facing availability (enabled/coming-soon/order/default) is resolved by
// lib/payments/catalog.ts, which layers admin settings + env on top of this
// registry. Use getPaymentCatalog() for UI and validation.

export * from './types';
