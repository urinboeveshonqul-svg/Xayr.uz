import { BrandedLoader } from '@/components/branding/BrandedLoader';

/**
 * Route-transition loader (App Router Suspense fallback). Shown on initial app
 * load, route navigation, and after auth/OAuth redirects while the next route's
 * server tree streams. Renders the premium branded logo animation.
 */
export default function Loading() {
  return <BrandedLoader />;
}
