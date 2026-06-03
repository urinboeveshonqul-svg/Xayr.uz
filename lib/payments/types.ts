// ============================================================
// Payment abstraction layer — provider-agnostic contracts.
// Real gateways (Click, Payme, …) implement PaymentProvider later.
// ============================================================

import type { PaymentMethod, DonationStatus } from '@/types';

// Provider id includes the DB payment methods plus an internal "manual"
// (no-gateway) provider used until real gateways are connected.
export type PaymentProviderId = PaymentMethod | 'manual';

export type PaymentStatus = Extract<DonationStatus, 'pending' | 'completed' | 'failed'>;

export interface CreatePaymentParams {
  donationId: string;
  amount: number;        // integer so'm
  campaignId: string;
  campaignTitle: string;
  returnUrl: string;     // where the user lands after checkout
}

export interface PaymentIntent {
  provider: PaymentProviderId;
  /** Reference stored on the donation row for reconciliation. */
  reference: string;
  status: PaymentStatus;
  /** Hosted-checkout URL to redirect to, or null for manual/cash flows. */
  redirectUrl: string | null;
  /** Optional human-readable next steps shown to the donor. */
  instructions?: string;
}

export interface WebhookResult {
  reference: string;
  status: PaymentStatus;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Create a payment for a pending donation and return how to complete it. */
  createPayment(params: CreatePaymentParams): Promise<PaymentIntent>;
  /**
   * Verify and parse an incoming gateway webhook/callback. Implemented by real
   * providers; the manual provider leaves it undefined. Must throw on invalid
   * signatures/payloads.
   */
  verifyWebhook?(request: Request): Promise<WebhookResult>;
}
