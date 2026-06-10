import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCampaignsManager, type TeamInfo } from '@/components/admin/AdminCampaignsManager';
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

  // Team members for the listed campaigns (split queries; empty map if the
  // campaign-teams migration isn't applied yet).
  const teamByCampaign: Record<string, TeamInfo[]> = {};
  if (campaigns.length > 0) {
    const { data: teamRows } = await admin
      .from('campaign_team_members')
      .select('campaign_id, user_id, role')
      .in('campaign_id', campaigns.map((c) => c.id));

    if (teamRows && teamRows.length > 0) {
      const { data: teamUsers } = await admin
        .from('users')
        .select('id, full_name')
        .in('id', [...new Set(teamRows.map((t) => t.user_id))]);
      const nameById = new Map((teamUsers ?? []).map((u) => [u.id, u.full_name] as const));

      for (const t of teamRows) {
        (teamByCampaign[t.campaign_id] ??= []).push({
          name: nameById.get(t.user_id) ?? null,
          role: t.role,
        });
      }
    }
  }

  return <AdminCampaignsManager initialCampaigns={campaigns} locale={locale} team={teamByCampaign} />;
}
