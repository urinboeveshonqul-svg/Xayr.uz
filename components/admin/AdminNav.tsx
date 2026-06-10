'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Megaphone, Users, ShieldCheck, Flag, Wallet } from 'lucide-react';
import { isLocale } from '@/i18n/config';

export function AdminNav() {
  const pathname = usePathname();
  const segments = pathname.split('/');
  const locale = isLocale(segments[1]) ? segments[1] : 'uz';
  const bare = '/' + segments.slice(2).join('/'); // path without locale, e.g. /admin/users

  const tabs = [
    { href: `/${locale}/admin`, match: '/admin', label: 'Umumiy', icon: LayoutDashboard },
    { href: `/${locale}/admin/campaigns`, match: '/admin/campaigns', label: 'Kampaniyalar', icon: Megaphone },
    { href: `/${locale}/admin/verifications`, match: '/admin/verifications', label: 'Tasdiqlash', icon: ShieldCheck },
    { href: `/${locale}/admin/users`, match: '/admin/users', label: 'Foydalanuvchilar', icon: Users },
    { href: `/${locale}/admin/flags`, match: '/admin/flags', label: 'Shikoyatlar', icon: Flag },
    { href: `/${locale}/admin/payouts`, match: '/admin/payouts', label: "To'lovlar", icon: Wallet },
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
