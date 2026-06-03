import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CreateCampaignForm } from '@/components/campaigns/CreateCampaignForm';

export const metadata: Metadata = {
  title: 'Kampaniya yaratish — Xayr',
};

export default async function CreateCampaignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/campaigns/create');
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <div className="mb-8">
            <h1 className="section-title">Yangi Kampaniya</h1>
            <p className="section-sub">
              Kampaniyangiz haqida batafsil ma'lumot kiriting
            </p>
          </div>
          <div className="card p-8">
            <CreateCampaignForm userId={user.id} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
