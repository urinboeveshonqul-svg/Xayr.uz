import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider } from '@/lib/payments';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  campaignId: z.string().uuid(),
  amount: z.number().int().min(1000).max(1_000_000_000),
  anonymous: z.boolean().optional().default(false),
  message: z.string().max(300).nullable().optional(),
  method: z.enum(['click', 'payme', 'uzcard', 'humo', 'cash']).nullable().optional(),
});

export async function POST(request: Request) {
  // 0) Rate limit by client IP to curb donation/payment spam.
  const ip = getClientIp(request);
  const rl = await enforceRateLimit('donation', `donation:${ip}`);
  if (!rl.success) {
    return tooManyRequests(rl, "Juda ko'p urinish. Iltimos, birozdan so'ng qayta urinib ko'ring.");
  }

  // 1) Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { campaignId, amount, anonymous, message, method } = parsed.data;

  // 2) Identify the donor (optional — anonymous/guest donations are allowed).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 3) Validate the campaign with the service role (avoids RLS edge cases).
  const admin = createAdminClient();
  const { data: campaign, error: cErr } = await admin
    .from('campaigns')
    .select('id, title, status, deadline')
    .eq('id', campaignId)
    .single();

  if (cErr || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  if (campaign.status !== 'active') {
    return NextResponse.json({ error: 'Campaign is not active' }, { status: 409 });
  }
  // Reject donations to a campaign whose deadline has passed, even if the nightly
  // expire sweep hasn't flipped its status to 'expired'/'funded' yet.
  if (campaign.deadline && new Date(campaign.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Campaign has ended' }, { status: 409 });
  }

  // 4) Create the transaction record server-side. Status is ALWAYS 'pending'
  //    here — the client can never set it to 'completed'.
  const { data: donation, error: dErr } = await admin
    .from('donations')
    .insert({
      campaign_id: campaignId,
      donor_id: user?.id ?? null,
      amount,
      anonymous,
      message: message || null,
      payment_method: method ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (dErr || !donation) {
    return NextResponse.json({ error: 'Could not record donation' }, { status: 500 });
  }

  // 5) Hand off to the payment provider abstraction (manual / no-gateway today).
  const provider = getPaymentProvider(method);
  const origin = new URL(request.url).origin;
  const intent = await provider.createPayment({
    donationId: donation.id,
    amount,
    campaignId,
    campaignTitle: campaign.title,
    returnUrl: `${origin}/campaigns`,
  });

  // 6) Persist the provider reference for reconciliation/webhooks.
  await admin.from('donations').update({ payment_ref: intent.reference }).eq('id', donation.id);

  return NextResponse.json(
    {
      donationId: donation.id,
      status: intent.status,
      reference: intent.reference,
      redirectUrl: intent.redirectUrl,
      instructions: intent.instructions ?? null,
    },
    { status: 201 }
  );
}
