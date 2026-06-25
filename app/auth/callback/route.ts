import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Auth callback for OAuth, email confirmation, and PASSWORD RECOVERY.
 *
 * Handles both arrival shapes Supabase can send, so the recovery link is never
 * dropped:
 *   • PKCE       → ?code=...             → exchangeCodeForSession
 *   • Token hash → ?token_hash=&type=…   → verifyOtp (stateless; works cross-device)
 *
 * The session cookies established by the exchange are attached to the SAME
 * redirect response (the middleware pattern), so they reliably reach `next`
 * (e.g. the reset-password page). Any failure — expired/invalid/used token —
 * lands on the login page with a flag the UI turns into a localized toast.
 * Tokens are never exposed to the client.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const oauthError = searchParams.get('error');

  const rawNext = searchParams.get('next') ?? '/';
  // Only allow internal relative paths (no open redirects).
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  // Provider returned an error before any token (e.g. user declined Google).
  if (oauthError) {
    const reason = oauthError === 'access_denied' ? 'cancelled' : 'failed';
    return NextResponse.redirect(`${origin}/auth/login?error=${reason}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey && (code || (tokenHash && type))) {
    // Build the success redirect up front so session cookies attach to IT.
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

  // Expired / invalid / already-used token, or nothing to process.
  return NextResponse.redirect(`${origin}/auth/login?error=failed`);
}
