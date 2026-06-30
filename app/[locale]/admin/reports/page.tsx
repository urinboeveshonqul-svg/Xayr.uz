import { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminReports, type ReportAdminRow } from '@/components/admin/AdminReports';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Yakuniy hisobotlar — Admin' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AdminReportsPage({ params }: Props) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const admin = createAdminClient();

  const { data: reportData } = await admin
    .from('campaign_reports')
    .select('id, campaign_id, user_id, title, message, status, fund_breakdown, admin_feedback, created_at, images, documents, videos')
    .order('created_at', { ascending: false });
  const reports = reportData ?? [];

  let rows: ReportAdminRow[] = [];
  if (reports.length > 0) {
    const campaignIds = [...new Set(reports.map((r) => r.campaign_id))];
    const userIds = [...new Set(reports.map((r) => r.user_id))];
    const [{ data: campaigns }, { data: users }] = await Promise.all([
      admin.from('campaigns').select('id, title, slug').in('id', campaignIds),
      admin.from('users').select('id, full_name').in('id', userIds),
    ]);
    const cById = new Map((campaigns ?? []).map((c) => [c.id, c] as const));
    const uById = new Map((users ?? []).map((u) => [u.id, u] as const));

    rows = reports.map((r) => {
      const c = cById.get(r.campaign_id);
      return {
        id: r.id,
        campaign_id: r.campaign_id,
        title: r.title,
        message: r.message,
        status: r.status,
        fund_breakdown: r.fund_breakdown,
        admin_feedback: r.admin_feedback,
        created_at: r.created_at,
        images: r.images,
        documents: r.documents,
        videos: r.videos,
        campaign_title: c?.title ?? null,
        campaign_slug: c?.slug ?? null,
        owner_name: uById.get(r.user_id)?.full_name ?? null,
      };
    });
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Yakuniy hisobotlar</h2>
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? `${pendingCount} ta ko'rib chiqilmagan hisobot` : "Ko'rib chiqilmagan hisobotlar yo'q"}
          </p>
        </div>
      </div>

      <AdminReports initialRows={rows} locale={lng} />
    </div>
  );
}
