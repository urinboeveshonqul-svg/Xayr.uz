import { Metadata } from 'next';
import { HandCoins } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminDonationsReconciliation, type ReconRow } from '@/components/admin/AdminDonationsReconciliation';
import { ACTIONABLE_DONATION_STATUSES } from '@/lib/payments/donation-lifecycle';
import type { PaymentEvent } from '@/types';

export const metadata: Metadata = { title: 'Xayriyalar — Admin' };
export const dynamic = 'force-dynamic';

/**
 * VIEW-ONLY donation reconciliation. Donations complete only via verified
 * gateway webhooks — there are no approve/reject controls here. Shows donations
 * with their logged payment_events (webhook history + duplicate attempts).
 */
export default async function AdminDonationsPage() {
  const admin = createAdminClient();

  const DONATION_COLUMNS =
    'id, payment_ref, payment_method, donor_id, campaign_id, amount, status, created_at, donor_name, donor_email, donor_phone, anonymous';

  // Two bounded queries, not a table scan:
  //   1. every ACTIONABLE (pending) donation — this is the page's default view,
  //      so it must be complete regardless of how much history exists. Served by
  //      the partial index idx_donations_pending_created (#62), which holds only
  //      pending rows and is kept small by the expiry sweep.
  //   2. the most recent 300 donations of ANY status, so completed / failed /
  //      cancelled / expired / refunded stay browsable and searchable here.
  // Without (1), a busy platform's newest 300 rows could be all completed and the
  // pending queue would look empty.
  const [{ data: actionableData }, { data: recentData }] = await Promise.all([
    admin
      .from('donations')
      .select(DONATION_COLUMNS)
      .in('status', ACTIONABLE_DONATION_STATUSES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(300),
    admin
      .from('donations')
      .select(DONATION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  // Merge, de-duplicate by id (a recent pending row appears in both), newest first.
  const byId = new Map<string, NonNullable<typeof recentData>[number]>();
  for (const d of [...(actionableData ?? []), ...(recentData ?? [])]) {
    if (!byId.has(d.id)) byId.set(d.id, d);
  }
  const donations = [...byId.values()].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  let rows: ReconRow[] = [];
  if (donations.length > 0) {
    const campaignIds = [...new Set(donations.map((d) => d.campaign_id))];
    const donorIds = [...new Set(donations.map((d) => d.donor_id).filter((id): id is string => !!id))];
    const refs = donations.map((d) => d.payment_ref).filter((r): r is string => !!r);

    const [{ data: campaigns }, { data: users }, { data: events }] = await Promise.all([
      admin.from('campaigns').select('id, title').in('id', campaignIds),
      donorIds.length > 0
        ? admin.from('users').select('id, full_name, email').in('id', donorIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
      refs.length > 0
        ? admin.from('payment_events').select('*').in('payment_ref', refs).order('received_at', { ascending: false })
        : Promise.resolve({ data: [] as PaymentEvent[] }),
    ]);

    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c.title] as const));
    const userById = new Map((users ?? []).map((u) => [u.id, u] as const));
    const eventsByRef = new Map<string, PaymentEvent[]>();
    for (const e of events ?? []) {
      if (!e.payment_ref) continue;
      const arr = eventsByRef.get(e.payment_ref) ?? [];
      arr.push(e);
      eventsByRef.set(e.payment_ref, arr);
    }

    rows = donations.map((d) => {
      const u = d.donor_id ? userById.get(d.donor_id) : null;
      return {
        id: d.id,
        payment_ref: d.payment_ref,
        payment_method: d.payment_method,
        // Admins always see the REAL identity (guest fields or the linked profile).
        donor_name: u ? u.full_name : d.donor_name,
        donor_email: u ? u.email : d.donor_email,
        donor_phone: u ? null : d.donor_phone,
        donor_type: (d.donor_id ? 'registered' : 'guest') as 'registered' | 'guest',
        anonymous: d.anonymous,
        campaign_title: campaignById.get(d.campaign_id) ?? null,
        amount: d.amount,
        status: d.status,
        created_at: d.created_at,
        events: d.payment_ref ? eventsByRef.get(d.payment_ref) ?? [] : [],
      };
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <HandCoins className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Xayriyalar — yarashtirish</h2>
          <p className="text-sm text-gray-500">Faqat ko‘rish · to‘lovlar provayder webhooki orqali tasdiqlanadi</p>
        </div>
      </div>

      <AdminDonationsReconciliation rows={rows} />
    </div>
  );
}
