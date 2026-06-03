import Link from 'next/link';
import { Heart, Mail, Phone, MapPin, Facebook, Instagram, Send } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">💚</span>
              </div>
              <span className="text-2xl font-black text-white">Xayr</span>
            </Link>
            <p className="text-sm leading-relaxed text-gray-400">
              O'zbekistondagi eng ishonchli xayriya platformasi. 
              Birgalikda yaxshilik qilamiz va hayotlarni o'zgartira
miz.
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
            <h3 className="text-white font-black text-lg mb-6">Platforma</h3>
            <ul className="space-y-3">
              {[
                { href: '/campaigns', label: 'Kampaniyalar' },
                { href: '/campaigns/create', label: 'Loyiha Yaratish' },
                { href: '/campaigns?category=medical', label: 'Tibbiy Yordam' },
                { href: '/campaigns?category=education', label: 'Ta\'lim Loyihalari' },
                { href: '/campaigns?category=disaster', label: 'Favqulodda Yordam' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-green-400 transition-colors hover:translate-x-1 inline-block"
                  >
                    → {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-black text-lg mb-6">Yordam</h3>
            <ul className="space-y-3">
              {[
                { href: '/help', label: 'Qo\'llanma' },
                { href: '/faq', label: 'Ko\'p So\'raladigan Savollar' },
                { href: '/safety', label: 'Xavfsizlik' },
                { href: '/fees', label: 'Komissiyalar' },
                { href: '/contact', label: 'Bog\'lanish' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-green-400 transition-colors hover:translate-x-1 inline-block"
                  >
                    → {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-black text-lg mb-6">Aloqa</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-sm">
                <Mail className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-semibold mb-1">Email</div>
                  <a href="mailto:info@xayr.uz" className="hover:text-green-400 transition-colors">
                    info@xayr.uz
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <Phone className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-semibold mb-1">Telefon</div>
                  <a href="tel:+998712000000" className="hover:text-green-400 transition-colors">
                    +998 71 200 00 00
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <MapPin className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white font-semibold mb-1">Manzil</div>
                  <span>Toshkent, O'zbekiston</span>
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
              <span className="text-gray-400">100% Xavfsiz To'lovlar</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">✓</span>
              </div>
              <span className="text-gray-400">Tasdiqlangan Platforma</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">24/7</span>
              </div>
              <span className="text-gray-400">Texnik Yordam</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/privacy" className="hover:text-green-400 transition-colors">
              Maxfiylik Siyosati
            </Link>
            <Link href="/terms" className="hover:text-green-400 transition-colors">
              Foydalanish Shartlari
            </Link>
            <Link href="/cookies" className="hover:text-green-400 transition-colors">
              Cookie Siyosati
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span>© {new Date().getFullYear()} Xayr. Barcha huquqlar himoyalangan.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
