'use client';

import Link from 'next/link';
import {
  Heart, Mail, Phone, MapPin, Facebook, Instagram, Send,
  ShieldCheck, BadgeCheck, Headphones,
} from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export function Footer() {
  const { t, locale } = useI18n();
  const L = (path: string) => `/${locale}${path}`;

  const platformLinks = [
    { href: L('/campaigns'), label: t('nav.campaigns') },
    { href: L('/campaigns/create'), label: t('footer.createProject') },
    { href: L('/campaigns?category=medical'), label: t('footer.medicalHelp') },
    { href: L('/campaigns?category=education'), label: t('footer.eduProjects') },
    { href: L('/campaigns?category=disaster'), label: t('footer.emergencyHelp') },
  ];

  const supportLinks = [
    { href: L('/help'), label: t('footer.guide') },
    { href: L('/faq'), label: t('footer.faq') },
    { href: L('/safety'), label: t('footer.safety') },
    { href: L('/fees'), label: t('footer.fees') },
    { href: L('/contact'), label: t('footer.contact') },
  ];

  const trust = [
    { Icon: ShieldCheck, label: t('footer.secure') },
    { Icon: BadgeCheck, label: t('footer.verified') },
    { Icon: Headphones, label: t('footer.support247') },
  ];

  const socials = [
    { href: '#', Icon: Send, label: 'Telegram' },
    { href: '#', Icon: Instagram, label: 'Instagram' },
    { href: '#', Icon: Facebook, label: 'Facebook' },
  ];

  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main 4-column grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 py-14">

          {/* Brand + social */}
          <div className="col-span-2 lg:col-span-1 space-y-4">
            <Link href={L('')} className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                <Heart className="w-5 h-5 text-white fill-white" />
              </div>
              <span className="text-xl font-black tracking-tight text-white">Xayr</span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs">{t('footer.tagline')}</p>
            <div className="flex items-center gap-2 pt-1">
              {socials.map(({ href, Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-green-600 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Platform */}
          <nav aria-label={t('footer.platformTitle')}>
            <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-4">
              {t('footer.platformTitle')}
            </h3>
            <ul className="space-y-3">
              {platformLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Support */}
          <nav aria-label={t('footer.supportTitle')}>
            <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-4">
              {t('footer.supportTitle')}
            </h3>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-4">
              {t('footer.contactTitle')}
            </h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <a href="mailto:info@xayr.uz" className="hover:text-white transition-colors">info@xayr.uz</a>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <a href="tel:+998712000000" className="hover:text-white transition-colors">+998 71 200 00 00</a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>{t('footer.address')}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust & safety */}
        <div className="border-t border-gray-800 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4 sm:gap-10">
            {trust.map(({ Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-2.5">
                <Icon className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-300">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Copyright + legal */}
        <div className="border-t border-gray-800 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <p className="text-gray-500 order-2 md:order-1">
            © {new Date().getFullYear()} Xayr. {t('footer.rights')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 order-1 md:order-2">
            <Link href={L('/privacy')} className="text-gray-400 hover:text-white transition-colors">{t('footer.privacy')}</Link>
            <Link href={L('/terms')} className="text-gray-400 hover:text-white transition-colors">{t('footer.terms')}</Link>
            <Link href={L('/cookies')} className="text-gray-400 hover:text-white transition-colors">{t('footer.cookies')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
