import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCampaignsManager } from '@/components/admin/AdminCampaignsManager';
import type { Campaign } from '@/types';

export const metadata: Metadata = { title: 'Kampaniyalar — Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminCampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from('campaigns')
    .select('*, profiles:users(full_name, avatar_url), categories(slug)')
    .order('created_at', { ascending: false })
    .limit(200);

  const campaigns = (data as unknown as Campaign[]) ?? [];

  return <AdminCampaignsManager initialCampaigns={campaigns} locale={locale} />;
}
