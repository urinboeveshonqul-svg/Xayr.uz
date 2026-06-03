'use client';

import { useEffect, useRef, useState } from 'react';

interface Stat {
  value: number;
  suffix: string;
  label: string;
  description: string;
  emoji: string;
}

const STATS: Stat[] = [
  { value: 1200,  suffix: '+', label: 'Kampaniyalar',    description: 'Muvaffaqiyatli yakunlangan',  emoji: '🎯' },
  { value: 50,    suffix: 'K+',label: 'Xayriyachilar',   description: 'Ishonchli donorlar',           emoji: '💚' },
  { value: 8500,  suffix: '+', label: 'Millrd so\'m',    description: 'Jami to\'plangan mablag\'',    emoji: '💰' },
  { value: 24,    suffix: 'h', label: 'Moderatsiya',     description: 'O\'rtacha tasdiqlash vaqti',   emoji: '✅' },
];

function useCountUp(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);

  return count;
}

function StatCard({ stat, animate }: { stat: Stat; animate: boolean }) {
  const count = useCountUp(stat.value, 1600, animate);
  return (
    <div className="stat-card group">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-2xl mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
        {stat.emoji}
      </div>
      <div className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-1 tabular-nums">
        {count}{stat.suffix}
      </div>
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{stat.label}</div>
      <div className="text-xs text-gray-400 dark:text-gray-500">{stat.description}</div>
    </div>
  );
}

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-16 bg-white dark:bg-gray-950" ref={ref}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="section-eyebrow mb-3">
            <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
            Raqamlarda
            <span className="w-4 h-0.5 bg-brand-500 rounded-full" />
          </span>
          <h2 className="section-title">Platformamiz ta'siri</h2>
          <p className="section-sub mt-2">
            Har bir xayriya — kimningdir hayotini o'zgartiradi
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {STATS.map((stat) => (
            <StatCard key={stat.label} stat={stat} animate={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
