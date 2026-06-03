import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import type { Campaign } from '@/types';

export const metadata: Metadata = {
  title: 'Admin Panel — Xayr',
};

async function getPendingCampaigns(): Promise<Campaign[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles(full_name, avatar_url)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role?: string } | null;
  if (profile?.role !== 'admin') redirect('/');

  const pendingCampaigns = await getPendingCampaigns();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="section-title">Admin Panel</h1>
            <p className="section-sub">Kampaniyalarni moderatsiya qiling</p>
          </div>
          <AdminDashboard pendingCampaigns={pendingCampaigns} />
        </div>
      </main>
    </>
  );
}
