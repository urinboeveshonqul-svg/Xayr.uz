import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { confirmDonation } from '@/lib/payments/confirm';

export const runtime = 'nodejs';

/**
 * Gateway webhook endpoint (provider-ready stub).
 *
 * Real providers will verify the signature/payload in verifyWebhook() and this
 * route confirms the matching donation via the service role. No gateway is wired
 * yet, so unknown/manual providers return 501 Not Implemented.
 *
 *   POST /api/payments/webhook?provider=click
 */
export async function POST(request: Request) {
  const providerId = new URL(request.url).searchParams.get('provider');
  const provider = getPaymentProvider(providerId);

  if (!provider.verifyWebhook) {
    return NextResponse.json(
      { error: 'Payment provider not configured' },
      { status: 501 }
    );
  }

  try {
    const result = await provider.verifyWebhook(request);
    await confirmDonation(result.reference, result.status);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }
}
