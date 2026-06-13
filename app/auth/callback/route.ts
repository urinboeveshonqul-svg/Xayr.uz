import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth + email-confirmation callback. Supabase redirects here with either a
 * PKCE `code` (success) or an `error` (the user cancelled / provider failure).
 * We exchange the code for a session and bounce to `next`; failures land on the
 * login page with a flag the UI turns into a localized toast.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const oauthError = searchParams.get('error');
  const next = searchParams.get('next') ?? '/';

  // Provider returned an error before any code — most commonly the user closed
  // or declined Google's consent screen (access_denied).
  if (oauthError) {
    const reason = oauthError === 'access_denied' ? 'cancelled' : 'failed';
    return NextResponse.redirect(`${origin}/auth/login?error=${reason}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=failed`);
}
