import { Flag } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCampaignFlags, type FlagRow } from '@/components/admin/AdminCampaignFlags';
import { isLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

// The joined campaign/reporter data is assembled from simple column-only queries
// (no PostgREST embeds), so every Supabase result type is unambiguous — no
// object-vs-array inference and no casts. Three indexed lookups, merged in memory.
async function getFlags(): Promise<FlagRow[]> {
  try {
    const admin = createAdminClient();

    const { data: flagRows } = await admin
      .from('campaign_flags')
      .select('id, campaign_id, reporter_id, reason, details, status, created_at, resolved_at')
      .order('created_at', { ascending: false });

    if (!flagRows || flagRows.length === 0) return [];

    const campaignIds = [...new Set(flagRows.map((f) => f.campaign_id))];
    const reporterIds = [
      ...new Set(flagRows.map((f) => f.reporter_id).filter((id): id is string => id !== null)),
    ];

    const [{ data: campaigns }, { data: reporters }] = await Promise.all([
      admin.from('campaigns').select('id, title, slug').in('id', campaignIds),
      admin.from('users').select('id, full_name').in('id', reporterIds),
    ]);

    const campaignById = new Map(
      (campaigns ?? []).map((c): [string, { title: string; slug: string }] => [
        c.id,
        { title: c.title, slug: c.slug },
      ])
    );
    const reporterById = new Map(
      (reporters ?? []).map((u): [string, { full_name: string | null }] => [
        u.id,
        { full_name: u.full_name },
      ])
    );

    return flagRows.map((f) => ({
      id: f.id,
      campaign_id: f.campaign_id,
      reason: f.reason,
      details: f.details,
      status: f.status,
      created_at: f.created_at,
      resolved_at: f.resolved_at,
      campaigns: campaignById.get(f.campaign_id) ?? null,
      reporter: f.reporter_id ? reporterById.get(f.reporter_id) ?? null : null,
    }));
  } catch {
    return [];
  }
}

export default async function AdminFlagsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';

  const flags = await getFlags();

  const pendingCount = flags.filter((f) => f.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Flag className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">
            Shikoyatlar
          </h2>
          <p className="text-sm text-gray-500">
            {pendingCount > 0
              ? `${pendingCount} ta ko'rib chiqilmagan shikoyat`
              : "Barcha shikoyatlar ko'rib chiqilgan"}
          </p>
        </div>
      </div>

      <AdminCampaignFlags
        initialFlags={flags}
        locale={lng}
      />
    </div>
  );
}
