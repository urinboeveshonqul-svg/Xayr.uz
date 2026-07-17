import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider } from '@/lib/payments';
import { isProviderEnabled } from '@/lib/payments/catalog';
import { PROVIDER_IDS } from '@/lib/payments/providers-meta';
import { enforceRateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';
import { verifyTurnstile, tokenFromBody, turnstileFailureResponse } from '@/lib/security/turnstile';

export const runtime = 'nodejs';

const schema = z.object({
  campaignId: z.string().uuid(),
  amount: z.number().int().min(1000).max(1_000_000_000),
  anonymous: z.boolean().optional().default(false),
  message: z.string().max(300).nullable().optional(),
  method: z.enum(['click', 'payme', 'paynet', 'uzum', 'uzcard', 'humo', 'cash']).nullable().optional(),
  submethod: z.enum(['wallet', 'card']).optional(),
  // Two donor-display modes. ('first' is retired — the DB CHECK + campaign_donors
  // view still honour it for historical rows, but new donations can't pick it.)
  name_display: z.enum(['full', 'anonymous']).optional().default('full'),
  // Guest contact — required only when a guest donates under their name.
  // Anonymous guests send nothing identifying (enforced below, not just in the UI).
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
  const { campaignId, amount, message, method, submethod, name_display, donor_name, donor_email, donor_phone } = parsed.data;
  // Anonymity is derived from the display choice — never trusted as a separate flag.
  const anonymous = name_display === 'anonymous';

  // 1a) Never trust the client's provider choice: a cataloged provider must be
  //     enabled server-side (implemented + configured + admin-enabled). Legacy
  //     non-gateway values keep the manual (record-only) fallback.
  if (method && PROVIDER_IDS.includes(method) && !(await isProviderEnabled(method))) {
    return NextResponse.json(
      { error: "Tanlangan to'lov usuli hozircha mavjud emas" },
      { status: 422 }
    );
  }

  // 2) Identify the donor (optional — anonymous/guest donations are allowed).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2a) Validation mirrors the chosen donation mode — the server decides, never
  //     the client. A guest donating under their name must supply name + email
  //     (receipt / payment confirmation / support / refunds); an anonymous guest
  //     supplies nothing identifying. Logged-in donors reuse their profile
  //     (linked via donor_id). Turnstile gates EVERY guest, named or not.
  const isGuest = !user;
  const namedGuest = isGuest && name_display === 'full';
  if (namedGuest) {
    if (!donor_name || donor_name.trim().length < 2) {
      return NextResponse.json({ error: 'name_required' }, { status: 422 });
    }
    if (!donor_email) {
      return NextResponse.json({ error: 'email_required' }, { status: 422 });
    }
  }
  if (isGuest) {
    const ts = await verifyTurnstile(tokenFromBody(body), ip);
    if (!ts.success) {
      return turnstileFailureResponse(ts);
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
      // Guest contact is PII (admin/owner-only via RLS). Stored ONLY for a named
      // guest — an anonymous donation never records identity from the form, and
      // logged-in donors reuse their profile. (Any payer info the gateway
      // returns is captured separately in payment_events, admin-only.)
      donor_name: namedGuest ? donor_name!.trim() : null,
      donor_email: namedGuest ? donor_email!.trim() : null,
      donor_phone: namedGuest ? (donor_phone?.trim() || null) : null,
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
    submethod,
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
      // Non-null only when the provider offers an in-page checkout (Click's
      // checkout.js, card submethod, NEXT_PUBLIC_CLICK_EMBEDDED_CARD=1).
      // redirectUrl is always sent alongside it, so a client that cannot open
      // the embedded window falls back to the redirect instead of stranding
      // the donor. Never a crediting signal — confirmDonation() still runs only
      // from the verified server-to-server callback.
      embedded: intent.embedded ?? null,
    },
    { status: 201 }
  );
}
