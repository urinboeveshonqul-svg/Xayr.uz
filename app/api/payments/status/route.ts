import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Minimal payment status by reference — powers the /payment/success poller so a
 * donor (incl. guests) can watch their pending payment confirm. Looked up by the
 * payment_ref the donor already holds; returns only non-sensitive fields (amount,
 * status, campaign title/slug) via the service role. No raw payloads, no PII.
 *
 *   GET /api/payments/status?ref=<payment_ref>
 */
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return NextResponse.json({ error: 'ref required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: donation } = await admin
    .from('donations')
    .select('amount, status, campaign_id')
    .eq('payment_ref', ref)
    .maybeSingle();

  if (!donation) return NextResponse.json({ found: false }, { status: 404 });

  const { data: campaign } = await admin
    .from('campaigns')
    .select('title, slug')
    .eq('id', donation.campaign_id)
    .maybeSingle();

  return NextResponse.json({
    found: true,
    amount: donation.amount,
    status: donation.status,
    campaignTitle: campaign?.title ?? null,
    campaignSlug: campaign?.slug ?? null,
  });
}
