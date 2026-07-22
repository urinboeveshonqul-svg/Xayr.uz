import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CreateCampaignClient } from '@/components/campaigns/CreateCampaignClient';
import { CampaignKycGate } from '@/components/campaigns/CampaignKycGate';
import { toKycStatus } from '@/lib/kyc';
import type { CampaignDraft } from '@/types';

export const metadata: Metadata = {
  title: 'Kampaniya yaratish — Xayr',
};
export const dynamic = 'force-dynamic';

export default async function CreateCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/campaigns/create');
  }

  // KYC (identity) verification is the campaign-creation gate. Re-checked
  // server-side by RLS + the publish trigger, so this can't be bypassed.
  const { data: profile } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', user.id)
    .single();
  const kyc = toKycStatus(profile?.verification_status);
  const approved = kyc === 'approved';

  // rejection_reason is no longer selectable by authenticated clients (it is KYC
  // moderation data — migration #53). Read the caller's OWN copy through the
  // own-row SECURITY DEFINER function instead.
  const { data: privateRows } = await supabase.rpc('my_private_profile');
  const rejectionReason = privateRows?.[0]?.rejection_reason ?? null;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, slug')
    .order('sort_order');

  // Existing drafts, newest first. Degrades gracefully to [] if the
  // campaign-drafts migration hasn't been applied yet.
  let drafts: CampaignDraft[] = [];
  if (approved) {
    try {
      const { data: draftRows } = await supabase
        .from('campaign_drafts')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      drafts = (draftRows as CampaignDraft[] | null) ?? [];
    } catch {
      // table not present yet — no drafts to offer
    }
  }

  return (
    <>
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <div className="mb-8">
            <h1 className="section-title">Yangi Kampaniya</h1>
            <p className="section-sub">Kampaniyangiz haqida batafsil ma'lumot kiriting</p>
          </div>

          {approved ? (
            <CreateCampaignClient
              userId={user.id}
              categories={categories ?? []}
              drafts={drafts}
              initialDraftId={draftId ?? null}
            />
          ) : (
            <CampaignKycGate status={kyc} rejectionReason={rejectionReason} />
          )}
        </div>
      </main>
    </>
  );
}
