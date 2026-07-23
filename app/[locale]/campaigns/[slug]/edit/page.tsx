import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EditCampaignForm } from '@/components/campaigns/EditCampaignForm';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Kampaniyani tahrirlash — Xayr' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function EditCampaignPage({ params }: Props) {
  const { locale, slug } = await params;
  const loc = isLocale(locale) ? locale : 'uz';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${loc}/auth/login?next=/campaigns/${slug}/edit`);

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, user_id, slug, title, description, story, goal_amount, location, deadline, video_url, created_at')
    .eq('slug', slug)
    .single();
  if (!campaign) notFound();

  // Owner or team manager may edit (same actors RLS authorizes for updates).
  let canEdit = campaign.user_id === user.id;
  if (!canEdit) {
    const { data: member } = await supabase
      .from('campaign_team_members')
      .select('role')
      .eq('campaign_id', campaign.id)
      .eq('user_id', user.id)
      .maybeSingle();
    canEdit = member?.role === 'owner' || member?.role === 'manager';
  }
  if (!canEdit) redirect(`/${loc}/campaigns/${slug}`);

  return (
    <>
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Pencil className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h1 className="section-title">Kampaniyani tahrirlash</h1>
              <p className="section-sub truncate">{campaign.title}</p>
            </div>
          </div>

          <EditCampaignForm campaign={campaign} locale={loc} />
        </div>
      </main>
    </>
  );
}
