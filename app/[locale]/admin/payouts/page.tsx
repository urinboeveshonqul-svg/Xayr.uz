import { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminPayouts, type PayoutRow } from '@/components/admin/AdminPayouts';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: "To'lovlar — Admin" };
export const dynamic = 'force-dynamic';

// Mirrors the DB campaign_available_balance(): committed = active + paid.
const COMMITTED = ['pending_review', 'approved', 'info_requested', 'paid'];

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminPayoutsPage({ params }: Props) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const admin = createAdminClient();

  const { data: requestData } = await admin
    .from('payout_requests')
    .select('*')
    .order('created_at', { ascending: false });
  const requests = requestData ?? [];

  let rows: PayoutRow[] = [];

  if (requests.length > 0) {
    const campaignIds = [...new Set(requests.map((r) => r.campaign_id))];
    const userIds = [...new Set(requests.map((r) => r.user_id))];
    const requestIds = requests.map((r) => r.id);

    const [{ data: campaigns }, { data: users }, { data: events }] = await Promise.all([
      admin.from('campaigns').select('id, title, slug, current_amount').in('id', campaignIds),
      admin.from('users').select('id, full_name, email, username').in('id', userIds),
      admin.from('payout_request_events').select('*').in('request_id', requestIds).order('created_at', { ascending: true }),
    ]);

    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c] as const));
    const userById = new Map((users ?? []).map((u) => [u.id, u] as const));

    // committed funds per campaign (active + paid requests)
    const committed = new Map<string, number>();
    for (const r of requests) {
      if (COMMITTED.includes(r.status)) {
        committed.set(r.campaign_id, (committed.get(r.campaign_id) ?? 0) + r.amount);
      }
    }

    const eventsByReq = new Map<string, PayoutRow['events']>();
    for (const e of events ?? []) {
      const arr = eventsByReq.get(e.request_id) ?? [];
      arr.push(e);
      eventsByReq.set(e.request_id, arr);
    }

    rows = requests.map((r) => {
      const c = campaignById.get(r.campaign_id);
      const u = userById.get(r.user_id);
      const raised = c?.current_amount ?? 0;
      return {
        ...r,
        campaign_title: c?.title ?? null,
        campaign_slug: c?.slug ?? null,
        owner_name: u?.full_name ?? null,
        owner_email: u?.email ?? null,
        owner_username: u?.username ?? null,
        raised,
        available: Math.max(0, raised - (committed.get(r.campaign_id) ?? 0)),
        events: eventsByReq.get(r.id) ?? [],
      };
    });
  }

  const pendingCount = rows.filter((r) => r.status === 'pending_review').length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">To&apos;lov so&apos;rovlari</h2>
          <p className="text-sm text-gray-500">
            {pendingCount > 0
              ? `${pendingCount} ta ko'rib chiqilmagan so'rov`
              : "Ko'rib chiqilmagan so'rovlar yo'q"}
          </p>
        </div>
      </div>

      <AdminPayouts initialRows={rows} locale={lng} />
    </div>
  );
}
