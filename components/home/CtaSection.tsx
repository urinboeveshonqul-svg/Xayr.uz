import Link from 'next/link';
import { Heart, ArrowRight, ShieldCheck, Zap, Clock } from 'lucide-react';

const TRUST = [
  { icon: ShieldCheck, text: '100% xavfsiz' },
  { icon: Zap,         text: '24 soatda tasdiqlash' },
  { icon: Clock,       text: 'Komissiyasiz' },
];

export function CtaSection() {
  return (
    <section className="relative py-20 overflow-hidden bg-gradient-brand">
      {/* Background texture */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full bg-white/5 blur-2xl" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow */}
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-semibold uppercase tracking-wider mb-6">
          <Heart className="w-3.5 h-3.5 fill-white/60" />
          Hoziroq boshlang
        </span>

        {/* Headline */}
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-5">
          Bugun birovning hayotini<br className="hidden sm:block" /> o'zgartirishingiz mumkin
        </h2>

        <p className="text-green-100 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
          Minglab insonlarga yordam bering yoki o'zingiz uchun kampaniya yarating.
          Har bir so'm muhim.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
          <Link
            href="/campaigns/create"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl
                       bg-white text-brand-700 font-bold text-base
                       hover:bg-brand-50 transition-all duration-200 shadow-card-lg
                       hover:shadow-xl hover:-translate-y-0.5 w-full sm:w-auto"
          >
            <Heart className="w-5 h-5 fill-brand-600 text-brand-600" />
            Kampaniya yaratish
          </Link>
          <Link
            href="/campaigns"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl
                       bg-brand-700 hover:bg-brand-800 text-white font-bold text-base
                       border border-brand-500 transition-all duration-200
                       hover:-translate-y-0.5 w-full sm:w-auto group"
          >
            Kampaniyalarni ko'rish
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Trust row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
          {TRUST.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5 text-white/70 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-white" />
              </div>
              {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
