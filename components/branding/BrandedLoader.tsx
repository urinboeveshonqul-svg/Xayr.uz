import { XayrLogo } from '@/components/branding/XayrLogo';

/**
 * Premium branded loading screen — the official Xayr logo, animated. Its four
 * strokes fade + slide in from their corners, rotate slightly, lock into the X,
 * the mark gives a tiny bounce and a soft green glow blooms, then it pauses and
 * repeats (~2.8s loop). Pure CSS (transform/opacity/filter only) → 60fps, no
 * layout shift; honors prefers-reduced-motion via the site-wide block (collapses
 * to a static assembled logo, no movement).
 *
 * Reuses the same <XayrLogo>/<CrossroadsGlyph> used across the site
 * (showText=false) — the logo is never recreated, stretched, or distorted. The
 * per-stroke animations are scoped to `.brand-mark`, so the navbar/footer logo
 * stays static. Reusable: pass `fullscreen={false}` to center within a section.
 */
export function BrandedLoader({
  fullscreen = true,
  className = '',
}: {
  fullscreen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center bg-white dark:bg-[#0F172A] ${
        fullscreen ? 'min-h-screen' : 'min-h-[40vh]'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        {/* Soft brand-green glow behind the mark */}
        <span
          aria-hidden="true"
          className="brand-glow absolute inset-0 m-auto w-28 h-28 rounded-full bg-emerald-500/30 blur-2xl"
        />
        {/* The exact site logo mark — no "Xayr" text; strokes animate within .brand-mark */}
        <div className="brand-mark relative">
          <XayrLogo size="lg" showText={false} />
        </div>
      </div>
      <span className="sr-only">Yuklanmoqda…</span>
    </div>
  );
}
