import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
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

  // ── Locale present → refresh the Supabase session ───────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // IMPORTANT: Do not remove — refreshes the Supabase session on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Path without the locale prefix, e.g. /uz/profile → /profile
  const bare = pathname.slice(`/${pathLocale}`.length) || '/';

  const isProtected = PROTECTED.some((p) => bare === p || bare.startsWith(`${p}/`));
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = `/${pathLocale}/auth/login`;
    url.searchParams.set('next', bare);
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && AUTH_ONLY.includes(bare)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${pathLocale}`;
    url.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
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
