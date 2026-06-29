import { Metadata } from 'next';
import { CalendarClock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminExtensions, type ExtensionRow } from '@/components/admin/AdminExtensions';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: "Muddat uzaytirish — Admin" };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminExtensionsPage({ params }: Props) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const admin = createAdminClient();

  const { data: reqData } = await admin
    .from('campaign_extension_requests')
    .select('*')
    .order('created_at', { ascending: false });
  const requests = reqData ?? [];

  let rows: ExtensionRow[] = [];
  if (requests.length > 0) {
    const campaignIds = [...new Set(requests.map((r) => r.campaign_id))];
    const userIds = [...new Set(requests.map((r) => r.user_id))];

    const [{ data: campaigns }, { data: users }] = await Promise.all([
      admin.from('campaigns').select('id, title, slug, goal_amount, current_amount').in('id', campaignIds),
      admin.from('users').select('id, full_name, email').in('id', userIds),
    ]);

    const cById = new Map((campaigns ?? []).map((c) => [c.id, c] as const));
    const uById = new Map((users ?? []).map((u) => [u.id, u] as const));

    rows = requests.map((r) => {
      const c = cById.get(r.campaign_id);
      const u = uById.get(r.user_id);
      return {
        ...r,
        campaign_title: c?.title ?? null,
        campaign_slug: c?.slug ?? null,
        owner_name: u?.full_name ?? null,
        owner_email: u?.email ?? null,
        goal_amount: c?.goal_amount ?? 0,
        current_amount: c?.current_amount ?? 0,
      };
    });
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <CalendarClock className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Muddatni uzaytirish so&apos;rovlari</h2>
          <p className="text-sm text-gray-500">
            {pendingCount > 0
              ? `${pendingCount} ta ko'rib chiqilmagan so'rov`
              : "Ko'rib chiqilmagan so'rovlar yo'q"}
          </p>
        </div>
      </div>

      <AdminExtensions initialRows={rows} locale={lng} />
    </div>
  );
}
