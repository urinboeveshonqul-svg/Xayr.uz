import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNextPath } from '@/lib/security/redirect';

/**
 * Single auth callback for OAuth, email confirmation, and PASSWORD RECOVERY —
 * but each flow is handled INDEPENDENTLY so they never cross-contaminate.
 *
 * Detection:
 *   • Recovery → `type=recovery` OR `next` targets the reset-password page.
 *   • OAuth / email confirmation → everything else.
 *
 * Why this matters: recovery must NEVER fall back to `/auth/login?error=…`,
 * because the login page's Google button shows a "Google sign-in failed" toast
 * for any `?error`. A recovery problem would otherwise look like a Google login
 * error. Recovery always lands on the reset page instead: the page shows the
 * password form when a session was established, or a friendly "link expired —
 * request another" state when it wasn't. Tokens are never exposed to the client.
 *
 * Arrival shapes handled for every flow:
 *   • PKCE       → ?code=...            → exchangeCodeForSession
 *   • Token hash → ?token_hash=&type=…  → verifyOtp (stateless; cross-device)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const oauthError = searchParams.get('error');

  // Internal relative paths only — rejects external/protocol-relative/backslash/
  // control-char targets and falls back to '/' (see lib/security/redirect).
  const next = safeNextPath(searchParams.get('next'));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasToken = Boolean(code || (tokenHash && type));

  const isRecovery = type === 'recovery' || next.startsWith('/auth/reset-password');

  // Helper: build a redirect whose response also receives any session cookies
  // set during the token exchange (the middleware cookie pattern).
  const exchangeAndRedirect = async (target: string): Promise<NextResponse> => {
    let response = NextResponse.redirect(target);
    if (!supabaseUrl || !supabaseKey || !hasToken) return response;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(target);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    });

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });

    // Caller decides what to do; recovery always lands on the reset page, where
    // a missing session renders the friendly "link expired" state.
    return error ? NextResponse.redirect(target) : response;
  };

  // ── Password recovery: fully isolated from OAuth/login. ──────────────
  if (isRecovery) {
    const resetUrl = `${origin}/auth/reset-password`;
    if (oauthError || !hasToken) return NextResponse.redirect(resetUrl);
    return exchangeAndRedirect(resetUrl);
  }

  // ── OAuth (Google) / email confirmation. ────────────────────────────
  if (oauthError) {
    const reason = oauthError === 'access_denied' ? 'cancelled' : 'failed';
    return NextResponse.redirect(`${origin}/auth/login?error=${reason}`);
  }

  if (supabaseUrl && supabaseKey && hasToken) {
    let response = NextResponse.redirect(`${origin}${next}`);
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(`${origin}${next}`);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    });
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });
    if (!error) return response;
  }

  return NextResponse.redirect(`${origin}/auth/login?error=failed`);
}
