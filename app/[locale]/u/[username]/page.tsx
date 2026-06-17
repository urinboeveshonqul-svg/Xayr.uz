import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle, Users, Megaphone, TrendingUp, CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { Avatar } from '@/components/ui/Avatar';
import { FollowButton } from '@/components/profile/FollowButton';
import { formatMoney } from '@/lib/utils';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { localeUrl } from '@/lib/seo';
import type { Campaign } from '@/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; username: string }>;
}

interface PublicUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  username: string | null;
  verification_status: string;
  created_at: string;
}

async function getProfile(username: string): Promise<PublicUser | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, bio, username, verification_status, created_at')
      .eq('username', username.toLowerCase().replace(/^@+/, ''))
      .maybeSingle();
    return (data as PublicUser) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, username } = await params;
  const loc = isLocale(locale) ? locale : 'uz';
  const p = await getProfile(username);
  if (!p) return { title: 'Topilmadi — Xayr', robots: { index: false, follow: false } };
  const name = p.full_name ?? `@${p.username}`;
  return {
    title: `${name} (@${p.username}) — Xayr`,
    description: p.bio ?? `${name} — Xayr`,
    alternates: { canonical: localeUrl(loc, `/u/${p.username}`) },
    openGraph: { title: `${name} (@${p.username})`, description: p.bio ?? undefined, type: 'profile' },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { locale, username } = await params;
  const loc = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  const d = dict.dash;

  const p = await getProfile(username);
  if (!p) notFound();

  const supabase = await createClient();
  const [{ data: campaignRows }, { count: followers }, { data: raisedRows }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url, username), categories(slug)')
      .eq('user_id', p.id)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false }),
    supabase.from('creator_followers').select('*', { count: 'exact', head: true }).eq('creator_id', p.id),
    supabase.from('campaigns').select('current_amount').eq('user_id', p.id),
  ]);

  const campaigns = (campaignRows as unknown as Campaign[]) ?? [];
  const totalRaised = (raisedRows ?? []).reduce((s, c) => s + (c.current_amount ?? 0), 0);
  const verified = p.verification_status === 'verified';
  const name = p.full_name ?? `@${p.username}`;

  const personLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    alternateName: `@${p.username}`,
    url: localeUrl(loc, `/u/${p.username}`),
    ...(p.avatar_url ? { image: p.avatar_url } : {}),
    ...(p.bio ? { description: p.bio } : {}),
  };

  const stats = [
    { Icon: Users, value: (followers ?? 0).toLocaleString('uz-UZ'), label: d.followersLbl },
    { Icon: Megaphone, value: campaigns.length.toLocaleString('uz-UZ'), label: d.campaignsLbl },
    { Icon: TrendingUp, value: `${formatMoney(totalRaised)}`, label: d.totalRaised },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }} />
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          {/* Header */}
          <div className="card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <Avatar src={p.avatar_url} name={name} className="w-24 h-24 text-3xl flex-shrink-0" />
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h1 className="text-2xl font-black text-gray-900 dark:text-white">{name}</h1>
                  {verified && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-600">
                      <CheckCircle className="w-4 h-4" /> {dict.ux.verified}
                    </span>
                  )}
                </div>
                <p className="text-gray-400 font-semibold">@{p.username}</p>
                {p.bio && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">{p.bio}</p>}
                <p className="text-xs text-gray-400 mt-2 inline-flex items-center gap-1 justify-center sm:justify-start">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {d.joined}: {new Date(p.created_at).toLocaleDateString('uz-UZ')}
                </p>
                <div className="mt-4 flex justify-center sm:justify-start">
                  <FollowButton creatorId={p.id} />
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              {stats.map(({ Icon, value, label }) => (
                <div key={label} className="text-center">
                  <Icon className="w-4 h-4 text-brand-600 mx-auto mb-1.5" />
                  <div className="text-lg font-black text-gray-900 dark:text-white break-words leading-tight">{value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Campaigns */}
          {campaigns.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{d.campaignsLbl}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
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
