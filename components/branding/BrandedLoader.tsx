import { XayrLogo } from '@/components/branding/XayrLogo';

/**
 * Premium branded loading screen — the official Xayr logo mark (no wordmark),
 * perfectly centered, with a soft brand-green glow, gentle float, and a subtle
 * scale/rotate "breathe". Pure CSS (transform/opacity/filter only) so it stays
 * 60fps and causes no layout shift; honors prefers-reduced-motion via the
 * site-wide block (collapses to a static fade).
 *
 * Reuses the same <XayrLogo> used across the site (showText=false) — the logo is
 * never recreated, stretched, or distorted. Reusable: pass `fullscreen={false}`
 * to center within a section instead of the viewport.
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
      <div className="brand-float relative flex items-center justify-center">
        {/* Soft brand-green glow behind the mark */}
        <span
          aria-hidden="true"
          className="brand-glow absolute inset-0 m-auto w-28 h-28 rounded-full bg-emerald-500/30 blur-2xl"
        />
        {/* The exact site logo mark — no "Xayr" text */}
        <div className="brand-mark relative">
          <XayrLogo size="lg" showText={false} />
        </div>
      </div>
      <span className="sr-only">Yuklanmoqda…</span>
    </div>
  );
}
