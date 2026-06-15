/**
 * Branded full-bleed route loader. Renders the Xayr "Crossroads" mark whose four
 * strokes drift apart and rejoin on an infinite loop (the tile gently breathes).
 *
 * Pure CSS animation (keyframes in globals.css) — no client JS, so it works as a
 * Server Component inside loading.tsx and adds zero hydration cost. Centered,
 * no layout shift. Honors prefers-reduced-motion via the site-wide block, which
 * freezes the motion to a clean static logo.
 */
export function XayrLoader() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-5 bg-white dark:bg-gray-950"
      role="status"
      aria-live="polite"
    >
      <div className="xayr-loader-tile w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25 flex items-center justify-center">
        <svg
          viewBox="0 0 96 96"
          className="w-11 h-11"
          fill="none"
          stroke="#ffffff"
          strokeWidth={13}
          strokeLinecap="butt"
          aria-hidden="true"
          focusable="false"
        >
          <line className="xayr-piece xayr-tl" x1="24" y1="24" x2="42" y2="42" />
          <line className="xayr-piece xayr-br" x1="72" y1="72" x2="54" y2="54" />
          <line className="xayr-piece xayr-tr" x1="72" y1="24" x2="54" y2="42" />
          <line className="xayr-piece xayr-bl" x1="24" y1="72" x2="42" y2="54" />
        </svg>
      </div>
      <span className="text-sm font-black tracking-wide text-gray-400 dark:text-gray-500">Xayr</span>
      <span className="sr-only">Yuklanmoqda…</span>
    </div>
  );
}
