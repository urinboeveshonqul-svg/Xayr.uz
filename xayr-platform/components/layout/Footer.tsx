import Link from 'next/link';
import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 mt-auto">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3">
              <span className="text-2xl">💚</span>
              <span className="text-xl font-black text-brand-600">Xayr</span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              O'zbekistondagi eng ishonchli xayriya platformasi. Kampaniya yarating va o'zgarish yarating.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Platforma</h3>
            <ul className="space-y-2">
              {[
                { href: '/campaigns', label: 'Kampaniyalar' },
                { href: '/campaigns/create', label: 'Kampaniya yaratish' },
                { href: '/auth/login', label: 'Kirish' },
                { href: '/auth/register', label: "Ro'yxatdan o'tish" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Aloqa</h3>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li>📧 info@xayr.uz</li>
              <li>📞 +998 71 000 00 00</li>
              <li>📍 Toshkent, O'zbekiston</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-600">
            © {new Date().getFullYear()} Xayr Platform. Barcha huquqlar himoyalangan.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1">
            <Heart className="w-3 h-3 text-red-400" />
            O'zbekiston uchun yaratilgan
          </p>
        </div>
      </div>
    </footer>
  );
}
