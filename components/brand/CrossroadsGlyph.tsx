/**
 * Crossroads brand glyph — the custom geometric "X" (no tile).
 * Renders four butt-capped strokes that stop short of center, leaving a clean
 * negative-space seam. Colored via `currentColor`, so the parent tile sets the
 * color (e.g. a `text-white` emerald tile). Sizing is controlled by `className`.
 *
 * Source of truth: branding/xayr-crossroads-*.svg
 */
export function CrossroadsGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={13}
      strokeLinecap="butt"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="24" y1="24" x2="42" y2="42" />
      <line x1="72" y1="72" x2="54" y2="54" />
      <line x1="72" y1="24" x2="54" y2="42" />
      <line x1="24" y1="72" x2="42" y2="54" />
    </svg>
  );
}
