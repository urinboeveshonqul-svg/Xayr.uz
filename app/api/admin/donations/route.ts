import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmDonation } from '@/lib/payments/confirm';

export const runtime = 'nodejs';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized', userId: '' };
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { ok: false as const, status: 403, error: 'Forbidden', userId: '' };
  return { ok: true as const, status: 200, error: '', userId: user.id };
}

const schema = z.object({
  donationId: z.string().uuid(),
  action: z.enum(['confirm', 'reject']),
});

// POST → confirm / reject a pending donation.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { donationId, action } = parsed.data;

  const admin = createAdminClient();

  // Load the donation; only a pending one can transition (idempotent guard).
  const { data: donation } = await admin
    .from('donations')
    .select('id, campaign_id, amount, status, payment_ref')
    .eq('id', donationId)
    .single();

  if (!donation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (donation.status !== 'pending') {
    return NextResponse.json({ error: 'Donation is not pending' }, { status: 409 });
  }

  const newStatus = action === 'confirm' ? 'completed' : 'failed';

  // Ensure a payment reference exists, then complete via the canonical
  // confirmDonation() path (service-role; the only way to leave 'pending').
  let reference = donation.payment_ref;
  if (!reference) {
    reference = `manual_${donation.id}`;
    await admin.from('donations').update({ payment_ref: reference }).eq('id', donation.id);
  }
  try {
    await confirmDonation(reference, newStatus);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not update donation' },
      { status: 500 }
    );
  }

  // Audit trail — who did what, when (best-effort; never fails the action).
  await admin.from('admin_audit_log').insert({
    admin_id: auth.userId,
    action: `donation_${action}`,
    entity_type: 'donation',
    entity_id: donation.id,
    meta: { amount: donation.amount, campaign_id: donation.campaign_id, new_status: newStatus },
  });

  // Notifications fire from DB triggers: donor via notify_on_donation_status,
  // campaign owner via apply_donation (on 'completed'). Campaign totals are
  // credited by apply_donation as part of the same transition.
  return NextResponse.json({ ok: true, status: newStatus });
}
