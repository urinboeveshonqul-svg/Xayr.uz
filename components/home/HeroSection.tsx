import Link from 'next/link';
import Image from 'next/image';
import { Heart, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

const TRUST_ITEMS = [
  { icon: ShieldCheck, text: '100% ishonchli' },
  { icon: Zap,         text: 'Tez va oson' },
  { icon: Heart,       text: 'Komissiyasiz' },
];

export function HeroSection() {
  return (
    <section className="relative bg-white dark:bg-gray-950 overflow-hidden">

      {/* ── Background blobs ─────────────────────────────── */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-brand-50 dark:bg-brand-900/10 blur-[120px] -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-brand-50 dark:bg-brand-900/10 blur-[100px] translate-y-1/2 -translate-x-1/4" />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: Copy ───────────────────────────────── */}
          <div className="text-center lg:text-left animate-fade-up">

            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 text-sm font-semibold mb-6">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              O'zbekistoning #1 xayriya platformasi
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black text-gray-900 dark:text-white leading-[1.1] tracking-tight mb-5">
              Birgalikda{' '}
              <span className="relative">
                <span className="text-brand-600">o'zgarish</span>
                <svg
                  className="absolute -bottom-1 left-0 w-full"
                  viewBox="0 0 200 8"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1 6 C50 1, 150 1, 199 6"
                    stroke="#16a34a"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity="0.4"
                  />
                </svg>
              </span>{' '}
              yarating
            </h1>

            {/* Description */}
            <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0">
              Sevganlaringizga yordam bering, muhim sabablarga hissa qo'shing.
              Kampaniya yarating yoki mavjud kampaniyalarga xayriya qiling.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-10">
              <Link
                href="/campaigns/create"
                className="btn-primary px-7 py-3.5 text-base w-full sm:w-auto"
              >
                <Heart className="w-5 h-5 fill-white" />
                Kampaniya yaratish
              </Link>
              <Link
                href="/campaigns"
                className="btn-secondary px-7 py-3.5 text-base w-full sm:w-auto group"
              >
                Kampaniyalarni ko'rish
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Trust row */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 sm:gap-6">
              {TRUST_ITEMS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  </div>
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Illustration ───────────────────────── */}
          <div className="relative flex items-center justify-center animate-fade-up [animation-delay:150ms]">
            {/* Outer glow ring */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[400px] h-[400px] rounded-full bg-brand-50 dark:bg-brand-900/10" />
            </div>

            {/* Main illustration image */}
            <div className="relative w-full max-w-[460px] aspect-square animate-float">
              <Image
                src="https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=920&q=80&auto=format&fit=crop"
                alt="Xayriya — birgalikda o'zgarish yaratamiz"
                fill
                className="object-cover rounded-3xl shadow-card-lg"
                priority
                sizes="(max-width: 1024px) 80vw, 460px"
              />
              {/* Overlay gradient at bottom */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 rounded-b-3xl bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            {/* Floating stat card — top left */}
            <div className="absolute top-4 -left-4 sm:-left-8 card shadow-card-md px-4 py-3 animate-fade-up [animation-delay:400ms]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-white fill-white" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 dark:text-white leading-none">1,200+</p>
                  <p className="text-xs text-gray-400 mt-0.5">Kampaniyalar</p>
                </div>
              </div>
            </div>

            {/* Floating stat card — bottom right */}
            <div className="absolute bottom-8 -right-4 sm:-right-8 card shadow-card-md px-4 py-3 animate-fade-up [animation-delay:550ms]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">💚</span>
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 dark:text-white leading-none">50,000+</p>
                  <p className="text-xs text-gray-400 mt-0.5">Xayriyachilar</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
