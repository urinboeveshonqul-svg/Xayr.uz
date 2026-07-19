'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

/**
 * Persistent site chrome (Navbar + Footer) around the page content.
 *
 * Rendered from the shared [locale] layout so it MOUNTS ONCE and survives
 * client-side navigation between content pages — the Navbar no longer remounts
 * (nor re-fetches the profile) on every navigation, which was the main source of
 * the per-click lag and the auth "flash". React reconciles the same Navbar
 * element across content navigations, so its mount effect runs a single time and
 * the `onAuthStateChange` listener keeps it in sync.
 *
 * Chrome is intentionally omitted for two route groups so behaviour is unchanged
 * from before this component existed:
 *   • /auth/*  — auth screens are full-screen (AuthShell); they never had chrome.
 *   • /admin/* — the admin section has its own layout that renders the Navbar +
 *                AdminNav; rendering it here too would double the navbar.
 * Every other route (home, campaigns, profile, legal, payment, …) keeps it.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // pathname is locale-prefixed, e.g. "/uz/campaigns/…" → section is segment[2]
  // ("" and the locale are segments [0] and [1]; the bare locale home has none).
  const section = pathname.split('/')[2];
  const bare = section === 'auth' || section === 'admin';

  if (bare) return <>{children}</>;

  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
