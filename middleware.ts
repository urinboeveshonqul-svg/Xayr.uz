import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import {
  enforceRateLimit,
  getClientIp,
  rateLimitHeaders,
  RATE_LIMIT_MISCONFIGURED_MESSAGE,
} from '@/lib/rate-limit';

// Routes (locale-stripped) that require an authenticated user.
const PROTECTED = ['/profile', '/campaigns/create', '/admin'];
// Auth pages (locale-stripped) a signed-in user shouldn't see.
const AUTH_ONLY = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Rate limit admin surfaces (API + dashboard pages) ───────────────
  // Done first so it covers /api/admin before the /api early-return below.
  const segments = pathname.split('/');
  const isAdminApi = pathname.startsWith('/api/admin');
  const isAdminPage = isLocale(segments[1]) && segments[2] === 'admin';
  if (isAdminApi || isAdminPage) {
    const ip = getClientIp(request);
    const rl = await enforceRateLimit('admin', `admin:${ip}`);
    if (!rl.success) {
      // configError = rate limiting is unconfigured in production (503), not a
      // caller who exceeded their quota (429).
      const status = rl.configError ? 503 : 429;
      const message = rl.configError
        ? RATE_LIMIT_MISCONFIGURED_MESSAGE
        : 'Too many requests. Please slow down.';
      const headers = rateLimitHeaders(rl);
      if (isAdminApi) {
        return NextResponse.json({ error: message }, { status, headers });
      }
      return new NextResponse(message, {
        status,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  // ── Rate limit search queries + the notifications page (per IP) ─────
  // These have no API route (search is server-rendered; notifications are read
  // client-side), so the page request is the only app-layer choke point.
  // Background prefetch fetches are excluded so Next.js link prefetching and
  // normal browsing never trip the limit; only real, query-bearing searches and
  // notification page loads are counted.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch';
  if (!isPrefetch && isLocale(segments[1])) {
    const sectionIp = getClientIp(request);
    const plainText = (rl: Awaited<ReturnType<typeof enforceRateLimit>>, msg: string) =>
      new NextResponse(rl.configError ? RATE_LIMIT_MISCONFIGURED_MESSAGE : msg, {
        status: rl.configError ? 503 : 429,
        headers: { ...rateLimitHeaders(rl), 'Content-Type': 'text/plain; charset=utf-8' },
      });

    // Search: the campaigns listing WITH a query (?q=…). Plain browsing and
    // category/sort filtering (no q) are never limited.
    if (
      segments[2] === 'campaigns' &&
      segments.length === 3 &&
      request.nextUrl.searchParams.has('q')
    ) {
      const rl = await enforceRateLimit('search', `search:${sectionIp}`);
      if (!rl.success) return plainText(rl, 'Too many searches. Please slow down.');
    }

    // Notifications page loads.
    if (segments[2] === 'notifications') {
      const rl = await enforceRateLimit('notifications', `notif:${sectionIp}`);
      if (!rl.success) return plainText(rl, 'Too many requests. Please slow down.');
    }
  }

  // Leave route handlers / internals untouched (the auth callback must stay
  // locale-agnostic so Supabase redirect URLs keep working).
  if (
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.includes('opengraph-image')
  ) {
    return NextResponse.next();
  }

  const pathLocale = pathname.split('/')[1];

  // ── No locale in the URL → redirect to the user's locale ────────────
  if (!isLocale(pathLocale)) {
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  // Path without the locale prefix, e.g. /uz/profile → /profile
  const bare = pathname.slice(`/${pathLocale}`.length) || '/';

  const isProtected = PROTECTED.some((p) => bare === p || bare.startsWith(`${p}/`));
  const isAuthOnly = AUTH_ONLY.includes(bare);

  // ── PUBLIC ROUTES → skip the Supabase auth.getUser() network round-trip ─────
  // Only protected + auth-only routes make an auth-based decision here (gate an
  // anonymous user, or bounce a signed-in user off the login/register page).
  // Every other route decides nothing from the session, so validating the JWT on
  // it only adds a Supabase Auth round-trip to the navigation for nothing — the
  // audit's largest remaining per-navigation cost, paid on almost every click by
  // signed-in users browsing public pages.
  //
  // This does NOT weaken security. Server-side authorization stays the source of
  // truth: protected pages/layouts/route handlers — and the owner-only pages that
  // self-protect (/campaigns/[slug]/{withdraw,edit,analytics}) — still call
  // getUser() server-side and redirect. Session refresh is preserved: the browser
  // client keeps the token fresh via autoRefreshToken while browsing public pages,
  // and the next protected-route navigation refreshes it here. Cookies pass
  // through untouched, and emitting no Set-Cookie on public responses keeps them
  // CDN-cacheable.
  if (!isProtected && !isAuthOnly) {
    return NextResponse.next({ request });
  }

  // ── Protected / auth-only routes → validate the session + refresh cookies ───
  // Hardened: a missing/invalid Supabase config or a transient auth/network
  // error must NEVER throw out of the middleware — that surfaces on Vercel as
  // MIDDLEWARE_INVOCATION_FAILED and 500s the ENTIRE site on every route. So we
  // fail OPEN: if the session can't be refreshed we let the request through
  // without auth gating. This is safe because every protected page, layout and
  // route handler re-checks auth server-side, so failing open here never grants
  // unauthorized access — it only avoids taking the whole site down.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[middleware] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — skipping auth refresh (fail-open).'
      );
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    });

    // Validate the JWT with Supabase (this also refreshes the session cookie via
    // the setAll handler above). Reached only for protected / auth-only routes.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = `/${pathLocale}/auth/login`;
      url.searchParams.set('next', bare);
      // Only claim the session EXPIRED when one actually existed: the request
      // carried Supabase auth cookies but getUser() rejected them (expired or
      // revoked). A visitor who was never signed in must not be told their
      // session ended — that would simply be false, and more confusing than
      // saying nothing. Chunked cookies (…auth-token.0/.1) match too.
      const hadSession = request.cookies
        .getAll()
        .some((c) => /^sb-.*-auth-token/.test(c.name));
      if (hadSession) url.searchParams.set('reason', 'expired');
      return copyCookies(supabaseResponse, NextResponse.redirect(url));
    }

    if (user && isAuthOnly) {
      const url = request.nextUrl.clone();
      url.pathname = `/${pathLocale}`;
      url.search = '';
      return copyCookies(supabaseResponse, NextResponse.redirect(url));
    }

    return supabaseResponse;
  } catch (err) {
    // Report middleware failures to Sentry (no-op without a DSN), then fail open.
    Sentry.captureException(err);
    console.error('[middleware] Supabase session refresh failed — allowing request (fail-open):', err);
    return supabaseResponse;
  }
}

// Carry refreshed session cookies onto a redirect response.
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
  return to;
}

export const config = {
  matcher: [
    // Exclude Next internals, SEO/metadata files (robots.txt, sitemap.xml,
    // *opengraph-image*), and static assets from the locale-redirect logic.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*opengraph-image.*|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xml|txt|webmanifest)$).*)',
  ],
};
