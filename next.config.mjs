import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// ── Content-Security-Policy ────────────────────────────────────────────────
// Scoped to exactly what the app loads:
//   • Supabase  — REST/Auth/Storage over https + Realtime over wss (*.supabase.co)
//   • OneSignal — SDK from cdn.onesignal.com; API/iframes on *.onesignal.com
//   • Turnstile — challenges.cloudflare.com (script + iframe)
// 'unsafe-inline' is required for scripts/styles because the Next.js App Router
// injects inline bootstrap scripts/styles and we don't use per-request nonces.
// img-src allows any https origin so Supabase Storage / Unsplash / Google avatars
// never break. Self-hosted Inter (next/font) and the OneSignal service worker are
// same-origin, so 'self' covers font-src / worker-src.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.onesignal.com https://onesignal.com https://*.onesignal.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://onesignal.com https://*.onesignal.com wss://*.onesignal.com https://cdn.onesignal.com https://challenges.cloudflare.com",
  "frame-src 'self' https://challenges.cloudflare.com https://onesignal.com https://*.onesignal.com https://*.os.tc",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' https: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Auto-upgrade any stray http subresource — production only, so http://localhost
  // dev is not force-upgraded to https.
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives },
  // Clickjacking protection (complements CSP frame-ancestors for old browsers).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Disable MIME sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send only the origin on cross-origin navigations.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Lock down powerful features the app doesn't use (push/notifications are not
  // gated by Permissions-Policy, so OneSignal is unaffected).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()' },
  // Force HTTPS for two years incl. subdomains (ignored by browsers over http,
  // so it's a no-op in local dev).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  images: {
    // Serve AVIF first (~20-30% smaller than WebP) with a WebP fallback; the
    // browser picks what it supports. Pure delivery optimization — no markup or
    // behavior change.
    formats: ['image/avif', 'image/webp'],
    // Uploaded images use unique storage paths, so a URL's optimized variant is
    // effectively immutable — cache it long to cut repeat optimization/CDN cost
    // (~31 days). Does not affect new uploads (they get new URLs).
    minimumCacheTTL: 2678400,
    remotePatterns: [
      { protocol: "https", hostname: "tyayyqjxvqarvdkboksr.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        // Apply the security headers to every route.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Wrap with Sentry so the client config is bundled and (when a SENTRY_AUTH_TOKEN
// is present at build time) source maps are uploaded. Org/project/token come
// from build-time env only — never committed, never NEXT_PUBLIC. With no token,
// source-map upload is skipped and the build proceeds normally.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
