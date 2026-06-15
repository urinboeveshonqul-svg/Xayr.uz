import type { Locale } from '@/i18n/config';

/**
 * Reliable inline SVG flags (not emoji — emoji flags don't render on Windows
 * and vary wildly across platforms). Each <svg> clips to its viewBox, and
 * preserveAspectRatio="none" fills whatever box the caller sizes, so there's no
 * layout shift and one className controls the size + rounding.
 */
export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  const common = {
    viewBox: '0 0 24 16',
    preserveAspectRatio: 'none' as const,
    className,
    role: 'img' as const,
    'aria-hidden': true,
  };

  if (locale === 'ru') {
    return (
      <svg {...common}>
        <rect width="24" height="16" fill="#fff" />
        <rect y="5.33" width="24" height="5.34" fill="#0039a6" />
        <rect y="10.67" width="24" height="5.33" fill="#d52b1e" />
      </svg>
    );
  }

  if (locale === 'en') {
    // Union Jack (simplified but recognizable).
    return (
      <svg {...common}>
        <rect width="24" height="16" fill="#012169" />
        {/* white saltire */}
        <path d="M0 0L24 16M24 0L0 16" stroke="#fff" strokeWidth="3.2" />
        {/* red saltire */}
        <path d="M0 0L24 16M24 0L0 16" stroke="#c8102e" strokeWidth="1.3" />
        {/* white cross */}
        <rect x="9.5" width="5" height="16" fill="#fff" />
        <rect y="5.5" width="24" height="5" fill="#fff" />
        {/* red cross */}
        <rect x="10.6" width="2.8" height="16" fill="#c8102e" />
        <rect y="6.6" width="24" height="2.8" fill="#c8102e" />
      </svg>
    );
  }

  // Uzbekistan (default): blue / white / green with red fimbriations,
  // crescent + stars in the top-left.
  return (
    <svg {...common}>
      <rect width="24" height="16" fill="#0099b5" />
      <rect y="5" width="24" height="6" fill="#fff" />
      <rect y="11" width="24" height="5" fill="#1eb53a" />
      <rect y="4.7" width="24" height="0.6" fill="#ce1126" />
      <rect y="10.7" width="24" height="0.6" fill="#ce1126" />
      {/* crescent */}
      <circle cx="3.4" cy="2.6" r="1.6" fill="#fff" />
      <circle cx="4.1" cy="2.4" r="1.35" fill="#0099b5" />
      {/* stars */}
      <circle cx="5.7" cy="1.4" r="0.28" fill="#fff" />
      <circle cx="6.7" cy="1.4" r="0.28" fill="#fff" />
      <circle cx="6.2" cy="2.5" r="0.28" fill="#fff" />
      <circle cx="7.2" cy="2.5" r="0.28" fill="#fff" />
    </svg>
  );
}
