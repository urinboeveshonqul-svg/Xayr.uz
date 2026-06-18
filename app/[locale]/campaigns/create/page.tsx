import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CreateCampaignForm } from '@/components/campaigns/CreateCampaignForm';
import { CampaignKycGate } from '@/components/campaigns/CampaignKycGate';
import type { VerificationStatus } from '@/types';

export const metadata: Metadata = {
  title: 'Kampaniya yaratish — Xayr',
};
export const dynamic = 'force-dynamic';

export default async function CreateCampaignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/campaigns/create');
  }

  // KYC (identity) verification is the campaign-creation gate. Re-checked
  // server-side by RLS + the publish trigger, so this can't be bypassed.
  const { data: profile } = await supabase
    .from('users')
    .select('verification_status, rejection_reason')
    .eq('id', user.id)
    .single();
  const status = (profile?.verification_status ?? 'unverified') as VerificationStatus;
  const approved = status === 'verified';

  const { data: categories } = approved
    ? await supabase.from('categories').select('id, slug').order('sort_order')
    : { data: null };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <div className="mb-8">
            <h1 className="section-title">Yangi Kampaniya</h1>
            <p className="section-sub">Kampaniyangiz haqida batafsil ma'lumot kiriting</p>
          </div>

          {approved ? (
            <div className="card p-8">
              <CreateCampaignForm userId={user.id} categories={categories ?? []} />
            </div>
          ) : (
            <CampaignKycGate status={status} rejectionReason={profile?.rejection_reason ?? null} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
