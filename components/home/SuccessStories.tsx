import Image from 'next/image';
import { Quote } from 'lucide-react';

const STORIES = [
  {
    name: 'Malika Yusupova',
    role: 'Tibbiy kampaniya tashkilotchisi',
    location: 'Toshkent',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&q=80&auto=format&fit=crop&crop=face',
    quote:
      "Xayr platformasi orqali onammning operatsiyasi uchun kerakli mablag'ni 2 haftada yig'dim. Bu platforma hayotimni o'zgartirdi.",
    raised: '12 mln so\'m',
    category: '🏥',
  },
  {
    name: 'Bobur Karimov',
    role: 'Ta\'lim fondi asoschisi',
    location: 'Samarqand',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&q=80&auto=format&fit=crop&crop=face',
    quote:
      "Qishloq bolalari uchun maktab kutubxonasi ochishni orzu qilardim. Xayr orqali 300 dan ortiq kishi yordam berdi.",
    raised: '28 mln so\'m',
    category: '📚',
  },
  {
    name: 'Nilufar Rashidova',
    role: 'Ekologiya faoli',
    location: 'Farg\'ona',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&q=80&auto=format&fit=crop&crop=face',
    quote:
      "Xayr platformasi bizga shahar bog'larini qayta tiklash loyihasini amalga oshirishga yordam berdi. Jamoamiz juda minnatdor.",
    raised: '8.5 mln so\'m',
    category: '🌱',
  },
];

export function SuccessStories() {
  return (
    <section className="py-20 bg-gray-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-12">
          <span className="section-eyebrow mb-3">
            <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
            Muvaffaqiyat hikoyalari
            <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
          </span>
          <h2 className="section-title">Ular muvaffaqiyatga erishdi</h2>
          <p className="section-sub max-w-xl mx-auto">
            Haqiqiy odamlar, haqiqiy natijalari — Xayr orqali amalga oshirilgan orzular
          </p>
        </div>

        {/* Story cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {STORIES.map((story) => (
            <div
              key={story.name}
              className="card p-6 hover:shadow-card-md transition-all duration-300 flex flex-col group"
            >
              {/* Quote icon */}
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
                <Quote className="w-5 h-5 text-brand-500" />
              </div>

              {/* Quote text */}
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5 flex-1 italic">
                "{story.quote}"
              </p>

              {/* Raised badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-semibold mb-5 self-start">
                {story.category} Jami yig'ildi: {story.raised}
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  <Image
                    src={story.avatar}
                    alt={story.name}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{story.name}</p>
                  <p className="text-xs text-gray-400">
                    {story.role} · {story.location}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
