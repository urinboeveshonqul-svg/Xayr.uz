import { CrossroadsGlyph } from '@/components/brand/CrossroadsGlyph';
import { cn } from '@/lib/utils';

/**
 * Single source of truth for the Xayr logo lockup — the official navbar mark:
 * a solid emerald tile with the full-bleed Crossroads glyph + the "Xayr"
 * wordmark. Every surface (navbar, auth, footer, …) renders this so sizing,
 * padding, radius, color, and typography stay identical.
 *
 * Presentational only — wrap in a <Link> at the call site.
 *
 * size: sm (footer compact) · md (footer) · lg (navbar + auth — the hero size).
 * textClassName overrides the wordmark color for dark surfaces (e.g. footer).
 */
const SIZES = {
  sm: { gap: 'gap-2', tile: 'w-8 h-8 rounded-lg', glyph: 'w-8 h-8', text: 'text-lg' },
  md: { gap: 'gap-2.5', tile: 'w-10 h-10 rounded-xl', glyph: 'w-10 h-10', text: 'text-xl' },
  lg: { gap: 'gap-3', tile: 'w-12 h-12 rounded-2xl', glyph: 'w-12 h-12', text: 'text-2xl' },
} as const;

export function XayrLogo({
  size = 'lg',
  showText = true,
  textClassName = 'text-slate-900 dark:text-white',
  className,
}: {
  size?: keyof typeof SIZES;
  showText?: boolean;
  textClassName?: string;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center', s.gap, className)}>
      <span
        className={cn(
          'bg-emerald-600 flex items-center justify-center shadow-lg flex-shrink-0',
          'group-hover:scale-110 transition-transform', // no-op unless an ancestor has `group`
          s.tile
        )}
      >
        <CrossroadsGlyph className={cn('text-white', s.glyph)} />
      </span>
      {showText && (
        <span className={cn('font-black tracking-tight', s.text, textClassName)}>Xayr</span>
      )}
    </span>
  );
}
