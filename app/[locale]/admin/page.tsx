import { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { formatMoney } from '@/lib/utils';
import { Users, Megaphone, Clock, Heart, TrendingUp, CheckCircle } from 'lucide-react';
import type { Campaign } from '@/types';

export const metadata: Metadata = { title: 'Admin Panel — Xayr' };
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const admin = createAdminClient();

  const [{ data: stats }, { data: pending }, { data: top }] = await Promise.all([
    admin.from('admin_stats').select('*').single(),
    admin
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url), categories(slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    admin
      .from('campaigns')
      .select('id, title, slug, current_amount, goal_amount, donors_count')
      .order('current_amount', { ascending: false })
      .limit(5),
  ]);

  const pendingCampaigns = (pending as unknown as Campaign[]) ?? [];
  const topCampaigns =
    (top as { id: string; title: string; slug: string; current_amount: number; goal_amount: number; donors_count: number }[]) ?? [];

  const cards = [
    { label: 'Foydalanuvchilar', value: String(stats?.users_count ?? 0), icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Kampaniyalar', value: String(stats?.campaigns_count ?? 0), icon: Megaphone, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Kutilmoqda', value: String(stats?.pending_count ?? 0), icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { label: 'Faol', value: String(stats?.active_count ?? 0), icon: CheckCircle, color: 'text-teal-500', bg: 'bg-teal-50' },
    { label: 'Xayriyalar', value: String(stats?.donations_count ?? 0), icon: Heart, color: 'text-red-500', bg: 'bg-red-50' },
    { label: "Yig'ilgan", value: `${formatMoney(stats?.total_raised ?? 0)} so'm`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-10">
      {/* Statistics */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Statistika</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <div key={i} className="card p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                <c.icon className={`w-6 h-6 ${c.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-black text-gray-900 dark:text-white truncate">{c.value}</div>
                <div className="text-xs text-gray-500">{c.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Report: top campaigns */}
      {topCampaigns.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Eng ko&apos;p to&apos;plangan kampaniyalar</h2>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            {topCampaigns.map((c, i) => (
              <Link
                key={c.id}
                href={`/${locale}/campaigns/${c.slug}`}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
              >
                <span className="text-lg font-black text-gray-300 w-6 text-center">{i + 1}</span>
                <span className="flex-1 min-w-0 font-semibold text-gray-900 dark:text-white truncate">{c.title}</span>
                <span className="text-xs text-gray-400 hidden sm:block">{c.donors_count} donor</span>
                <span className="font-bold text-brand-600 flex-shrink-0">{formatMoney(c.current_amount)} so&apos;m</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Pending approvals */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Tasdiqlash kutilmoqda</h2>
        <AdminDashboard pendingCampaigns={pendingCampaigns} />
      </section>
    </div>
  );
}
