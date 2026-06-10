import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Heart, CheckCircle2, Bookmark } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { VerificationStatusCard } from '@/components/profile/VerificationStatusCard';
import { RecentlyViewed } from '@/components/campaigns/RecentlyViewed';
import type { CampaignReport } from '@/types';

export const metadata: Metadata = {
  title: 'Mening profilim — Xayr',
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/profile');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/');

  // The creator's published completion reports (read-only). Public-read RLS;
  // if the migration isn't applied the query errors → [] and the section hides.
  type ReportRow = CampaignReport & { campaigns?: { title: string; slug: string } | null };
  let reports: ReportRow[] = [];
  try {
    const { data } = await supabase
      .from('campaign_reports')
      .select('*, campaigns(title, slug)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    reports = (data as unknown as ReportRow[]) ?? [];
  } catch {
    reports = [];
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <div className="mb-8">
            <h1 className="section-title">Mening profilim</h1>
            <p className="section-sub">Shaxsiy ma'lumotlaringizni boshqaring</p>
          </div>

          <VerificationStatusCard
            status={profile.verification_status}
            verifiedAt={profile.verified_at}
            rejectionReason={profile.rejection_reason}
          />

          <div className="card p-8">
            <ProfileForm profile={profile} email={user.email ?? ''} />
          </div>

          <Link
            href={`/${locale}/profile/donations`}
            className="mt-4 card p-4 flex items-center gap-3 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-brand-600" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              Mening xayriyalarim
            </span>
            <span className="ml-auto text-gray-400">→</span>
          </Link>

          <Link
            href={`/${locale}/profile/saved`}
            className="mt-4 card p-4 flex items-center gap-3 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Bookmark className="w-5 h-5 text-brand-600" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              Saqlangan kampaniyalar
            </span>
            <span className="ml-auto text-gray-400">→</span>
          </Link>

          {/* Recently viewed campaigns — per-user (client); hidden when empty */}
          <RecentlyViewed title="So'nggi ko'rilgan kampaniyalar" compact />

          {/* Completion reports the user has published (read-only) */}
          {reports.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                Yakuniy hisobotlar
              </h2>
              <div className="space-y-3">
                {reports.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                          {r.title}
                        </p>
                        {r.campaigns?.slug && (
                          <Link
                            href={`/${locale}/campaigns/${r.campaigns.slug}`}
                            className="text-sm text-brand-600 hover:underline truncate block mt-0.5"
                          >
                            {r.campaigns.title}
                          </Link>
                        )}
                      </div>
                      <time className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(r.created_at).toLocaleDateString('uz-UZ')}
                      </time>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                      {r.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
