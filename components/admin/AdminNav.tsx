'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Megaphone, Users, ShieldCheck, Flag, Wallet, Mail, HandCoins, CalendarClock, CheckCircle2 } from 'lucide-react';
import { isLocale } from '@/i18n/config';
import { useI18n } from '@/components/i18n/I18nProvider';

export function AdminNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const segments = pathname.split('/');
  const locale = isLocale(segments[1]) ? segments[1] : 'uz';
  const bare = '/' + segments.slice(2).join('/'); // path without locale, e.g. /admin/users

  const tabs = [
    { href: `/${locale}/admin`, match: '/admin', label: t('admin.navOverview'), icon: LayoutDashboard },
    { href: `/${locale}/admin/campaigns`, match: '/admin/campaigns', label: t('admin.navCampaigns'), icon: Megaphone },
    { href: `/${locale}/admin/extensions`, match: '/admin/extensions', label: t('admin.navExtensions'), icon: CalendarClock },
    { href: `/${locale}/admin/reports`, match: '/admin/reports', label: t('admin.navReports'), icon: CheckCircle2 },
    { href: `/${locale}/admin/donations`, match: '/admin/donations', label: t('admin.navDonations'), icon: HandCoins },
    { href: `/${locale}/admin/verifications`, match: '/admin/verifications', label: t('admin.navVerifications'), icon: ShieldCheck },
    { href: `/${locale}/admin/users`, match: '/admin/users', label: t('admin.navUsers'), icon: Users },
    { href: `/${locale}/admin/flags`, match: '/admin/flags', label: t('admin.navFlags'), icon: Flag },
    { href: `/${locale}/admin/payouts`, match: '/admin/payouts', label: t('admin.navPayouts'), icon: Wallet },
    { href: `/${locale}/admin/messages`, match: '/admin/messages', label: t('admin.navMessages'), icon: Mail },
  ];

  return (
    <nav className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 dark:border-gray-800 pb-2">
      {tabs.map((tab) => {
        const active = tab.match === '/admin' ? bare === '/admin' : bare.startsWith(tab.match);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              active
                ? 'bg-brand-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
