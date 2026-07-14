import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider } from '@/lib/payments';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { verifyTurnstile, tokenFromBody, TURNSTILE_FAILED_MESSAGE } from '@/lib/security/turnstile';

export const runtime = 'nodejs';

const schema = z.object({
  campaignId: z.string().uuid(),
  amount: z.number().int().min(1000).max(1_000_000_000),
  anonymous: z.boolean().optional().default(false),
  message: z.string().max(300).nullable().optional(),
  method: z.enum(['click', 'payme', 'uzcard', 'humo', 'cash']).nullable().optional(),
  name_display: z.enum(['full', 'first', 'anonymous']).optional().default('full'),
  // Guest contact (required for guests; ignored for logged-in donors).
  donor_name: z.string().max(120).nullable().optional(),
  donor_email: z.string().email().max(254).nullable().optional(),
  donor_phone: z.string().max(40).nullable().optional(),
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
  const { campaignId, amount, message, method, name_display, donor_name, donor_email, donor_phone } = parsed.data;
  // Anonymity is derived from the display choice — never trusted as a separate flag.
  const anonymous = name_display === 'anonymous';

  // 2) Identify the donor (optional — anonymous/guest donations are allowed).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2a) Guests must provide a name + email and pass Turnstile (bot/fraud gate).
  //     Logged-in donors reuse their profile (linked via donor_id).
  const isGuest = !user;
  if (isGuest) {
    if (!donor_name || donor_name.trim().length < 2) {
      return NextResponse.json({ error: 'name_required' }, { status: 422 });
    }
    if (!donor_email) {
      return NextResponse.json({ error: 'email_required' }, { status: 422 });
    }
    const ts = await verifyTurnstile(tokenFromBody(body), ip);
    if (!ts.success) {
      return NextResponse.json({ error: TURNSTILE_FAILED_MESSAGE }, { status: 400 });
    }
  }

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
      name_display,
      // Guest contact is PII (admin/owner-only via RLS). Logged-in donors reuse
      // their profile, so these stay null for them.
      donor_name: isGuest ? donor_name!.trim() : null,
      donor_email: isGuest ? donor_email!.trim() : null,
      donor_phone: isGuest ? (donor_phone?.trim() || null) : null,
    })
    .select('id')
    .single();

  if (dErr || !donation) {
    return NextResponse.json({ error: 'Could not record donation' }, { status: 500 });
  }

  // 5) Hand off to the payment provider abstraction. Real gateways (Click)
  //    redirect to hosted checkout and land the donor back on the payment
  //    status page; unconfigured methods fall back to the manual provider.
  const provider = getPaymentProvider(method);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const intent = await provider.createPayment({
    donationId: donation.id,
    amount,
    campaignId,
    campaignTitle: campaign.title,
    returnUrl: `${appUrl}/payment/success`,
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
