import { Flag } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCampaignFlags } from '@/components/admin/AdminCampaignFlags';
import { isLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

async function getFlags() {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('campaign_flags')
      .select(`
        id, campaign_id, reason, details, status, created_at, resolved_at,
        campaigns ( title, slug ),
        reporter:users!reporter_id ( full_name )
      `)
      .order('created_at', { ascending: false });
    return data ?? [];
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
