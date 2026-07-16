import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import { enforceRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

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
      const headers = rateLimitHeaders(rl);
      if (isAdminApi) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
      }
      return new NextResponse('Too many requests. Please slow down.', {
        status: 429,
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
      new NextResponse(msg, {
        status: 429,
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

  // ── Locale present → refresh the Supabase session ───────────────────
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

    // IMPORTANT: Do not remove — refreshes the Supabase session on every request.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isProtected = PROTECTED.some((p) => bare === p || bare.startsWith(`${p}/`));
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

    if (user && AUTH_ONLY.includes(bare)) {
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
