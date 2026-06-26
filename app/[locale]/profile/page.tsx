import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Heart, CheckCircle2, Bookmark, Users, UserPlus, HandHeart, Megaphone, TrendingUp, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { VerificationStatusCard } from '@/components/profile/VerificationStatusCard';
import { DonorPrivacyToggle } from '@/components/profile/DonorPrivacyToggle';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { UsernameSettings } from '@/components/profile/UsernameSettings';
import { PushSettings } from '@/components/push/PushSettings';
import { PayoutAccountForm } from '@/components/profile/PayoutAccountForm';
import { RecentlyViewed } from '@/components/campaigns/RecentlyViewed';
import { formatMoney, timeAgo } from '@/lib/utils';
import { toKycStatus } from '@/lib/kyc';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import type { CampaignReport, PayoutAccount } from '@/types';

export const metadata: Metadata = {
  title: 'Mening profilim — Xayr',
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(isLocale(locale) ? locale : 'uz');
  const d = dict.dash;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/profile');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/');

  // Follower / following counts (public-read RLS; null counts → 0 if the
  // creator-followers migration hasn't been applied yet).
  const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
    supabase.from('creator_followers').select('*', { count: 'exact', head: true }).eq('creator_id', user.id),
    supabase.from('creator_followers').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
  ]);

  // Donor statistics — aggregated from the donations table via the
  // privacy-enforcing RPC (owner always sees their own real numbers). If the
  // donor-profiles migration isn't applied yet, the RPC errors → stats = null
  // and the section degrades to zeros.
  const { data: statsRows } = await supabase.rpc('get_donor_stats', { p_user_id: user.id });
  const stats = statsRows?.[0] ?? null;

  // Push-notification preferences (null if the push migration isn't applied yet
  // → PushSettings falls back to sensible defaults and still saves on first use).
  let pushPrefs: {
    push_enabled: boolean;
    donations: boolean;
    campaign_updates: boolean;
    verification: boolean;
    marketing: boolean;
  } | null = null;
  try {
    const { data } = await supabase
      .from('notification_preferences')
      .select('push_enabled, donations, campaign_updates, verification, marketing')
      .eq('user_id', user.id)
      .maybeSingle();
    pushPrefs = data ?? null;
  } catch {
    pushPrefs = null;
  }

  // Saved payout account (null if none yet, or if the payout-info migration
  // hasn't been applied — the section then lets the user add one).
  let payoutAccount: PayoutAccount | null = null;
  try {
    const { data } = await supabase
      .from('payout_accounts')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    payoutAccount = data ?? null;
  } catch {
    payoutAccount = null;
  }

  // Recent donations (latest 5; full history lives at /profile/donations).
  interface RecentDonation {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    campaigns: { title: string; slug: string } | null;
  }
  const { data: recentRows } = await supabase
    .from('donations')
    .select('id, amount, status, created_at, campaigns(title, slug)')
    .eq('donor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);
  const recentDonations = (recentRows as unknown as RecentDonation[]) ?? [];

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
            <h1 className="section-title">{dict.nav.profile}</h1>
            {profile.username && (
              <p className="text-sm text-gray-400 font-semibold">@{profile.username}</p>
            )}
            <p className="section-sub">{d.manageInfo}</p>
          </div>

          <AvatarUpload
            userId={user.id}
            initialUrl={profile.avatar_url}
            name={profile.full_name}
          />

          {/* Username (change with 30-day cooldown + live availability) */}
          <UsernameSettings
            initialUsername={profile.username}
            changedAt={profile.username_changed_at}
          />

          <VerificationStatusCard
            status={toKycStatus(profile.verification_status)}
            rejectionReason={profile.rejection_reason}
          />

          {/* Follower / following stats */}
          <div className="card p-4 mb-6 flex items-center justify-around text-center">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-brand-600" />
              </div>
              <div className="text-left">
                <div className="text-lg font-black text-gray-900 dark:text-white leading-none">
                  {(followersCount ?? 0).toLocaleString('uz-UZ')}
                </div>
                <div className="text-xs text-gray-400">{d.followersLbl}</div>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-100 dark:bg-gray-800" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-brand-600" />
              </div>
              <div className="text-left">
                <div className="text-lg font-black text-gray-900 dark:text-white leading-none">
                  {(followingCount ?? 0).toLocaleString('uz-UZ')}
                </div>
                <div className="text-xs text-gray-400">{d.followingLbl}</div>
              </div>
            </div>
          </div>

          {/* Donor statistics — derived from donations; visibility via privacy toggle */}
          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {d.donorStats}
              </h2>
              <DonorPrivacyToggle userId={user.id} initial={profile.donor_stats_public ?? false} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
                <HandHeart className="w-4 h-4 text-brand-600 mx-auto mb-1.5" />
                <div className="text-lg font-black text-gray-900 dark:text-white leading-none">
                  {(stats?.donations_count ?? 0).toLocaleString('uz-UZ')}
                </div>
                <div className="text-xs text-gray-400 mt-1">{d.donationsLbl}</div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
                <Megaphone className="w-4 h-4 text-brand-600 mx-auto mb-1.5" />
                <div className="text-lg font-black text-gray-900 dark:text-white leading-none">
                  {(stats?.campaigns_count ?? 0).toLocaleString('uz-UZ')}
                </div>
                <div className="text-xs text-gray-400 mt-1">{d.campaignsLbl}</div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
                <TrendingUp className="w-4 h-4 text-brand-600 mx-auto mb-1.5" />
                <div className="text-lg font-black text-gray-900 dark:text-white leading-none break-words">
                  {formatMoney(stats?.total_amount ?? 0)}
                </div>
                <div className="text-xs text-gray-400 mt-1">{d.totalSum}</div>
              </div>
            </div>

            {stats?.first_donation && (
              <p className="text-xs text-gray-400 mt-3 text-center">
                {d.firstDonation} {new Date(stats.first_donation).toLocaleDateString('uz-UZ')}
              </p>
            )}

            {recentDonations.length > 0 && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  {d.recentDonations}
                </p>
                {recentDonations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      {d.campaigns ? (
                        <Link
                          href={`/${locale}/campaigns/${d.campaigns.slug}`}
                          className="font-semibold text-gray-900 dark:text-white hover:text-brand-600 truncate block"
                        >
                          {d.campaigns.title}
                        </Link>
                      ) : (
                        <span className="font-semibold text-gray-400">—</span>
                      )}
                      <span className="text-xs text-gray-400">{timeAgo(d.created_at)}</span>
                    </div>
                    <span className="font-bold text-brand-600 flex-shrink-0">
                      {formatMoney(d.amount)} so&apos;m
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payout information (card details for withdrawals; RLS owner+admin) */}
          <PayoutAccountForm userId={user.id} initial={payoutAccount} />

          {/* Browser push-notification settings (opt-in + per-category) */}
          <PushSettings userId={user.id} initial={pushPrefs} />

          <div className="card p-8">
            <ProfileForm profile={profile} email={user.email ?? ''} />
          </div>

          <Link
            href={`/${locale}/profile/campaigns`}
            className="mt-4 card p-4 flex items-center gap-3 hover:shadow-md transition-all border-l-4 border-l-brand-500"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-brand-600" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {dict.nav.myCampaigns}
            </span>
            <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
          </Link>

          <Link
            href={`/${locale}/profile/donations`}
            className="mt-4 card p-4 flex items-center gap-3 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-brand-600" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {d.myDonations}
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
              {d.savedCampaigns}
            </span>
            <span className="ml-auto text-gray-400">→</span>
          </Link>

          {/* Recently viewed campaigns — per-user (client); hidden when empty */}
          <RecentlyViewed compact />

          {/* Completion reports the user has published (read-only) */}
          {reports.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                {d.finalReports}
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
