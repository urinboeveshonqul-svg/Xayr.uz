/**
 * Route-transition indicator. Shown by the App Router while the next route's
 * server tree (and its Supabase queries) streams. Instead of a full-page logo
 * takeover, this is a slim top progress sweep over a faint content skeleton —
 * a modern, non-blocking transition (Vercel/Linear style). Pure CSS, no JS.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top progress sweep */}
      <div
        className="fixed top-0 inset-x-0 z-[80] h-0.5 overflow-hidden bg-brand-100/40 dark:bg-brand-900/30"
        role="status"
        aria-label="Yuklanmoqda"
      >
        <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 animate-route-progress" />
      </div>

      {/* Faint content skeleton so the area isn't blank during the render */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 max-w-5xl">
        <div className="w-2/3 max-w-sm h-7 rounded-xl bg-gray-200/70 dark:bg-gray-800/70 animate-pulse mb-3" />
        <div className="w-1/3 max-w-[160px] h-4 rounded-lg bg-gray-100 dark:bg-gray-800/60 animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
              <div className="p-5 space-y-3">
                <div className="w-full h-4 rounded bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
                <div className="w-2/3 h-4 rounded bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
