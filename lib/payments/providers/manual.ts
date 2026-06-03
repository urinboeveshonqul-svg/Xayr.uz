import type { PaymentProvider } from '../types';

/**
 * Manual / no-gateway provider.
 *
 * Records the donation as "pending" without charging anything. A real payment
 * is completed later out-of-band (admin confirmation or, once wired, a gateway
 * webhook calling confirmDonation). This keeps the donation flow fully working
 * end-to-end before any payment gateway is connected.
 */
export const manualProvider: PaymentProvider = {
  id: 'manual',

  async createPayment({ donationId }) {
    return {
      provider: 'manual',
      reference: `manual_${donationId}`,
      status: 'pending',
      redirectUrl: null,
      instructions:
        "Xayriyangiz qayd etildi. To'lov tizimi ulangach yoki tasdiqlangach faollashadi.",
    };
  },

  // No verifyWebhook — there is no gateway to receive callbacks from yet.
};
