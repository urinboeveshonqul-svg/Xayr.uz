/**
 * Global route-transition skeleton. Renders INSTANTLY on navigation while the
 * server component tree (and its Supabase queries) resolves — without it,
 * clicks feel dead for the entire server render. Pure CSS, no client JS.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Navbar placeholder (matches the real 80px bar) */}
      <div className="h-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="w-28 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="hidden lg:block w-72 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="w-24 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 max-w-5xl">
        <div className="w-2/3 max-w-sm h-8 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse mb-3" />
        <div className="w-1/3 max-w-[180px] h-4 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="p-5 space-y-3">
                <div className="w-full h-4 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                <div className="w-2/3 h-4 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
