import { XayrLoader } from '@/components/brand/XayrLoader';

/**
 * Global route-transition loader. Renders INSTANTLY on navigation while the
 * server component tree (and its Supabase queries) resolves — without it, clicks
 * feel dead for the entire server render. The branded Xayr mark animates via
 * pure CSS (no client JS), so this stays a Server Component.
 */
export default function Loading() {
  return <XayrLoader />;
}
