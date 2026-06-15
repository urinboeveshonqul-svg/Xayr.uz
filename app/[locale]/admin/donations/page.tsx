import { Metadata } from 'next';
import { HandCoins } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminDonations, type DonationRow } from '@/components/admin/AdminDonations';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Xayriyalar — Admin' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminDonationsPage({ params }: Props) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const admin = createAdminClient();

  // Newest first; cap to a workable window (filtering/search is client-side).
  const { data: donationData } = await admin
    .from('donations')
    .select('id, campaign_id, donor_id, amount, anonymous, message, status, payment_method, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  const donations = donationData ?? [];

  let rows: DonationRow[] = [];
  if (donations.length > 0) {
    // Split queries (no embed inference): resolve campaign titles + donor names.
    const campaignIds = [...new Set(donations.map((d) => d.campaign_id))];
    const donorIds = [...new Set(donations.map((d) => d.donor_id).filter((id): id is string => !!id))];

    const [{ data: campaigns }, { data: users }] = await Promise.all([
      admin.from('campaigns').select('id, title, slug').in('id', campaignIds),
      donorIds.length > 0
        ? admin.from('users').select('id, full_name, email').in('id', donorIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    ]);

    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c] as const));
    const userById = new Map((users ?? []).map((u) => [u.id, u] as const));

    rows = donations.map((d) => {
      const c = campaignById.get(d.campaign_id);
      const u = d.donor_id ? userById.get(d.donor_id) : undefined;
      return {
        ...d,
        campaign_title: c?.title ?? null,
        campaign_slug: c?.slug ?? null,
        donor_name: d.anonymous ? null : u?.full_name ?? null,
        donor_email: d.anonymous ? null : u?.email ?? null,
      };
    });
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <HandCoins className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Xayriyalar</h2>
          <p className="text-sm text-gray-500">
            {pendingCount > 0
              ? `${pendingCount} ta tasdiqlanmagan xayriya`
              : 'Tasdiqlanmagan xayriyalar yo‘q'}
          </p>
        </div>
      </div>

      <AdminDonations initialRows={rows} locale={lng} />
    </div>
  );
}
