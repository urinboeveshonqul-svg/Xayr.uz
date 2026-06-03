import Link from 'next/link';
import { PenLine, CheckCircle2, HandHeart, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: PenLine,
    color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    ring:  'ring-blue-100 dark:ring-blue-900/30',
    step:  '01',
    title: 'Kampaniya yarating',
    description:
      "Kampaniyangiz haqida ma'lumot kiriting: sarlavha, maqsad miqdori, tavsif va rasm qo'shing. Bu atigi 5 daqiqa vaqt oladi.",
  },
  {
    icon: CheckCircle2,
    color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    ring:  'ring-amber-100 dark:ring-amber-900/30',
    step:  '02',
    title: "Moderatsiyadan o'ting",
    description:
      "Jamoamiz kampaniyangizni ko'rib chiqadi va odatda 24 soat ichida tasdiqlaydi. Siz bildirishnoma olasiz.",
  },
  {
    icon: HandHeart,
    color: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    ring:  'ring-brand-100 dark:ring-brand-900/30',
    step:  '03',
    title: "Xayriya yig'ing",
    description:
      "Tasdiqlangan kampaniyangiz platformada ko'rinadi. Odamlar xayriya qila boshlaydi va siz mablag' yig'asiz.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-white dark:bg-gray-950">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="section-eyebrow mb-3">
            <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
            Jarayon
            <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
          </span>
          <h2 className="section-title">Qanday ishlaydi?</h2>
          <p className="section-sub max-w-xl mx-auto">
            Uch oddiy qadamda kampaniya yarating va yordam qabul qilishni boshlang
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">

          {/* Connector line (desktop only) */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute top-14 left-[calc(16.666%+2rem)] right-[calc(16.666%+2rem)] h-0.5 bg-gradient-to-r from-blue-200 via-amber-200 to-brand-200 dark:from-blue-900/40 dark:via-amber-900/40 dark:to-brand-900/40"
          />

          {STEPS.map(({ icon: Icon, color, ring, step, title, description }, i) => (
            <div
              key={step}
              className="relative flex flex-col items-center text-center group"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {/* Step number badge */}
              <div className="absolute -top-3 right-6 md:right-auto md:left-1/2 md:-translate-x-1/2 z-10">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-black shadow-sm">
                  {i + 1}
                </span>
              </div>

              {/* Icon circle */}
              <div
                className={`relative w-28 h-28 rounded-3xl ${color} ring-8 ${ring}
                            flex items-center justify-center mb-6
                            group-hover:scale-110 transition-transform duration-300 shadow-card`}
              >
                <Icon className="w-10 h-10" strokeWidth={1.75} />
              </div>

              {/* Copy */}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link href="/campaigns/create" className="btn-primary px-8 py-3.5 text-base">
            Hoziroq boshlash
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}
