import Link from 'next/link';
import { Heart, Mail, Phone, MapPin, ExternalLink } from 'lucide-react';

const NAV_LINKS = [
  { href: '/campaigns',        label: 'Barcha kampaniyalar' },
  { href: '/campaigns/create', label: 'Kampaniya yaratish' },
  { href: '/auth/login',       label: 'Kirish' },
  { href: '/auth/register',    label: "Ro'yxatdan o'tish" },
];

const CATEGORIES = [
  { href: '/campaigns?cat=medical',     label: '🏥 Tibbiyot' },
  { href: '/campaigns?cat=education',   label: '📚 Ta\'lim' },
  { href: '/campaigns?cat=disaster',    label: '🆘 Favqulodda' },
  { href: '/campaigns?cat=community',   label: '🤝 Jamiyat' },
  { href: '/campaigns?cat=environment', label: '🌱 Ekologiya' },
  { href: '/campaigns?cat=animal',      label: '🐾 Hayvonlar' },
];

export function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400">
      {/* Main footer */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 group mb-4">
              <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-brand">
                <Heart className="w-[18px] h-[18px] text-white fill-white" />
              </div>
              <span className="text-xl font-black text-white">Xayr</span>
            </Link>
            <p className="text-sm leading-relaxed mb-5 max-w-xs">
              O'zbekistondagi eng ishonchli xayriya platformasi. Birgalikda o'zgarish yarating.
            </p>
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-800 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse-slow" />
              Ishonchli va xavfsiz platforma
            </div>
          </div>

          {/* Platform links */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Platforma</h3>
            <ul className="space-y-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-brand-400 transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Kategoriyalar</h3>
            <ul className="space-y-2.5">
              {CATEGORIES.map((cat) => (
                <li key={cat.href}>
                  <Link
                    href={cat.href}
                    className="text-sm hover:text-brand-400 transition-colors duration-150"
                  >
                    {cat.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Aloqa</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:info@xayr.uz"
                  className="flex items-center gap-2.5 text-sm hover:text-brand-400 transition-colors"
                >
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  info@xayr.uz
                </a>
              </li>
              <li>
                <a
                  href="tel:+998710000000"
                  className="flex items-center gap-2.5 text-sm hover:text-brand-400 transition-colors"
                >
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  +998 71 000 00 00
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Toshkent, O'zbekiston
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Xayr Platform. Barcha huquqlar himoyalangan.
          </p>
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <Heart className="w-3 h-3 text-red-500 fill-red-500" />
            O'zbekiston uchun yaratilgan
          </p>
        </div>
      </div>
    </footer>
  );
}
