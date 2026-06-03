import type { PaymentProvider, PaymentProviderId } from './types';
import { manualProvider } from './providers/manual';

// Provider registry. As real gateways are implemented, register them here, e.g.
//   click: clickProvider,
//   payme: paymeProvider,
// and the donation API + webhooks pick them up automatically — no other changes.
const providers: Partial<Record<PaymentProviderId, PaymentProvider>> = {
  manual: manualProvider,
};

/**
 * Resolve the provider for a chosen donation method. Until real gateways are
 * registered, everything falls back to the manual (no-gateway) provider.
 */
export function getPaymentProvider(method?: string | null): PaymentProvider {
  if (method && method in providers) {
    return providers[method as PaymentProviderId] ?? manualProvider;
  }
  return manualProvider;
}

export * from './types';
