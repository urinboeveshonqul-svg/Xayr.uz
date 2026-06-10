/**
 * Shared square avatar: shows the user's photo when available, otherwise the
 * initial in the brand-gradient circle (the app's existing placeholder style).
 * Hook-free, so it renders in both server and client components.
 *
 * `className` controls size + initial font size, e.g. "w-9 h-9 text-xs".
 */
export function Avatar({
  src,
  name,
  className = 'w-9 h-9 text-xs',
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? ''}
        loading="lazy"
        decoding="async"
        className={`${className} rounded-full object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-800`}
      />
    );
  }
  return (
    <div
      className={`${className} rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {(name ?? 'U').charAt(0).toUpperCase()}
    </div>
  );
}
