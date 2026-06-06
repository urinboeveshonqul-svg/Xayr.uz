'use client';

import Link from 'next/link';
import { Heart, Mail, Phone, MapPin, Facebook, Instagram, Send, Check } from 'lucide-react';
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

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">

          {/* Brand */}
          <div className="space-y-4">
            <Link href={L('')} className="flex items-center gap-3 group">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Heart className="w-6 h-6 text-white fill-white" />
              </div>
              <span className="text-2xl font-black text-white">Xayr</span>
            </Link>
            <p className="text-sm leading-relaxed text-gray-400">
              {t('footer.tagline')}
            </p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-green-600 rounded-xl flex items-center justify-center transition-all hover:scale-110">
                <Send className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-green-600 rounded-xl flex items-center justify-center transition-all hover:scale-110">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-green-600 rounded-xl flex items-center justify-center transition-all hover:scale-110">
                <Facebook className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-white font-black text-lg mb-6">{t('footer.platformTitle')}</h3>
            <ul className="space-y-3">
              {platformLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm hover:text-green-400 transition-colors hover:translate-x-1 inline-block">
                    → {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-black text-lg mb-6">{t('footer.supportTitle')}</h3>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm hover:text-green-400 transition-colors hover:translate-x-1 inline-block">
                    → {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-black text-lg mb-6">{t('footer.contactTitle')}</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-sm">
                <Mail className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-semibold mb-1">{t('footer.emailLabel')}</div>
                  <a href="mailto:info@xayr.uz" className="hover:text-green-400 transition-colors">
                    info@xayr.uz
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <Phone className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-semibold mb-1">{t('footer.phoneLabel')}</div>
                  <a href="tel:+998712000000" className="hover:text-green-400 transition-colors">
                    +998 71 200 00 00
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <MapPin className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-semibold mb-1">{t('footer.addressLabel')}</div>
                  <span>{t('footer.address')}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="border-t border-gray-800 pt-8 mb-8">
          <div className="flex flex-wrap items-center justify-center gap-8">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <Heart className="w-4 h-4 text-white" />
              </div>
              <span className="text-gray-400">{t('footer.secure')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
              <span className="text-gray-400">{t('footer.verified')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">24/7</span>
              </div>
              <span className="text-gray-400">{t('footer.support247')}</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href={L('/privacy')} className="hover:text-green-400 transition-colors">
              {t('footer.privacy')}
            </Link>
            <Link href={L('/terms')} className="hover:text-green-400 transition-colors">
              {t('footer.terms')}
            </Link>
            <Link href={L('/cookies')} className="hover:text-green-400 transition-colors">
              {t('footer.cookies')}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span>© {new Date().getFullYear()} Xayr. {t('footer.rights')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
