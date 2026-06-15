'use client';

import Link from 'next/link';
import {
  Mail, Phone, MapPin, Facebook, Instagram, Send,
  ShieldCheck, BadgeCheck, Headphones, ChevronDown,
} from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { XayrLogo } from '@/components/branding/XayrLogo';

export function Footer() {
  const { t, locale } = useI18n();
  const L = (path: string) => `/${locale}${path}`;

  const platformLinks = [
    { href: L('/campaigns'), label: t('nav.campaigns') },
    { href: L('/campaigns/create'), label: t('footer.createProject') },
  ];

  const supportLinks = [
    { href: L('/guide'), label: t('footer.guide') },
    { href: L('/faq'), label: t('footer.faq') },
    { href: L('/security'), label: t('footer.safety') },
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

        {/* ── Mobile compact footer (<sm only): logo + 2-line tagline,
               tap-to-expand accordions, compact phone/email row ── */}
        <div className="sm:hidden pt-8 pb-3">
          <Link href={L('')} className="inline-flex">
            <XayrLogo size="sm" textClassName="text-white" />
          </Link>
          <p className="text-xs leading-relaxed line-clamp-2 mt-2">{t('footer.tagline')}</p>

          {/* Social icons (smaller on mobile) */}
          <div className="flex items-center gap-2 mt-3">
            {socials.map(({ href, Icon, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-green-600 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
              </a>
            ))}
          </div>

          {/* Accordions — native <details>, no JS */}
          <div className="mt-4 border-t border-gray-800">
            <details className="group border-b border-gray-800">
              <summary className="flex items-center justify-between py-3 cursor-pointer list-none text-xs font-bold text-white uppercase tracking-wider [&::-webkit-details-marker]:hidden">
                {t('footer.platformTitle')}
                <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <ul className="pb-3 space-y-2.5">
                {platformLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>

            <details className="group border-b border-gray-800">
              <summary className="flex items-center justify-between py-3 cursor-pointer list-none text-xs font-bold text-white uppercase tracking-wider [&::-webkit-details-marker]:hidden">
                {t('footer.supportTitle')}
                <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <ul className="pb-3 space-y-2.5">
                {supportLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>

            <details className="group border-b border-gray-800">
              <summary className="flex items-center justify-between py-3 cursor-pointer list-none text-xs font-bold text-white uppercase tracking-wider [&::-webkit-details-marker]:hidden">
                {t('footer.contactTitle')}
                <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="pb-3 text-sm flex items-start gap-2">
                <MapPin className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                {t('footer.address')}
              </p>
            </details>
          </div>

          {/* Always-visible phone + email (tap-to-call / tap-to-mail) */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-3 text-xs">
            <a href="tel:+998776244040" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Phone className="w-3.5 h-3.5 text-green-500" /> +998 77 624 40 40
            </a>
            <a href="mailto:Uzxayr@gmail.com" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Mail className="w-3.5 h-3.5 text-green-500" /> Uzxayr@gmail.com
            </a>
          </div>
        </div>

        {/* Main 4-column grid (tablet/desktop — unchanged, hidden on mobile) */}
        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 py-14">

          {/* Brand + social */}
          <div className="col-span-2 lg:col-span-1 space-y-4">
            <Link href={L('')} className="inline-flex">
              <XayrLogo size="md" textClassName="text-white" />
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
                <a href="mailto:Uzxayr@gmail.com" className="hover:text-white transition-colors">Uzxayr@gmail.com</a>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <a href="tel:+998776244040" className="hover:text-white transition-colors">+998 77 624 40 40</a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>{t('footer.address')}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust & safety — compact wrap-row on mobile, unchanged ≥sm */}
        <div className="border-t border-gray-800 py-3 sm:py-6">
          <div className="flex flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1.5 sm:gap-10">
            {trust.map(({ Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-1.5 sm:gap-2.5">
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-gray-300">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Copyright + legal — single compact row on mobile, unchanged ≥sm */}
        <div className="border-t border-gray-800 py-3 sm:py-6 flex flex-col md:flex-row items-center justify-between gap-1.5 sm:gap-4 text-xs sm:text-sm">
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
