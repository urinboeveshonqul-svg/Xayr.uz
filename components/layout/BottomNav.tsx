'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Megaphone, PlusCircle, Bell, User } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Mobile-only bottom navigation (hidden ≥lg). Static — no data fetching, so it
 * never re-renders outside route changes. The in-flow spacer reserves the bar's
 * height so fixed positioning causes no content overlap and no CLS. Safe-area
 * padding handles notched iPhones (viewportFit: 'cover' is set in the layout).
 */
export function BottomNav() {
  const { locale } = useI18n();
  const pathname = usePathname();
  // Path without the locale prefix, e.g. /uz/campaigns -> /campaigns
  const bare = '/' + pathname.split('/').slice(2).join('/');

  const items = [
    { href: `/${locale}`, label: 'Asosiy', Icon: Home, active: bare === '/' },
    {
      href: `/${locale}/campaigns`,
      label: 'Kampaniyalar',
      Icon: Megaphone,
      active: bare.startsWith('/campaigns') && !bare.startsWith('/campaigns/create'),
    },
    {
      href: `/${locale}/campaigns/create`,
      label: 'Yaratish',
      Icon: PlusCircle,
      active: bare.startsWith('/campaigns/create'),
    },
    {
      href: `/${locale}/notifications`,
      label: 'Xabarlar',
      Icon: Bell,
      active: bare.startsWith('/notifications'),
    },
    { href: `/${locale}/profile`, label: 'Profil', Icon: User, active: bare.startsWith('/profile') },
  ];

  return (
    <>
      {/* In-flow spacer: keeps page content (incl. footer) above the fixed bar */}
      <div className="h-16 lg:hidden" aria-hidden />

      <nav
        aria-label="Mobil navigatsiya"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-100 dark:border-gray-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16">
          {items.map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors ${
                active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-110' : ''}`}
              />
              <span className="leading-none">{label}</span>
              <span
                className={`h-1 w-1 rounded-full transition-colors ${
                  active ? 'bg-brand-600' : 'bg-transparent'
                }`}
              />
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
