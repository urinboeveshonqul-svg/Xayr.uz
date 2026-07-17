import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/security/timing-safe';

// ============================================================
// Cron endpoint authentication — the SINGLE place scheduled routes are gated.
//
// Cron routes are publicly-routable GET endpoints that MUTATE data
// (expire_due_campaigns, generate_financial_snapshot). Vercel Cron authenticates
// scheduled invocations by attaching `Authorization: Bearer $CRON_SECRET`.
//
// Failure philosophy (mirrors lib/security/turnstile and lib/rate-limit):
//   • CRON_SECRET not set, PRODUCTION → FAIL CLOSED (503). Previously these
//     routes ran unauthenticated with only a console warning, so anyone who
//     knew the URL could trigger the sweep. A public unauthenticated mutation
//     is not an acceptable default.
//   • CRON_SECRET not set, DEVELOPMENT → allowed, so the job can be run by hand
//     locally without inventing a secret.
//   • CRON_SECRET set, wrong/missing bearer → 401.
//
// The comparison is constant-time: a plain !== leaks the secret one byte at a
// time to an attacker who can measure response latency across many requests.
// ============================================================

/** Shown when the cron secret is absent in production. */
export const CRON_MISCONFIGURED_MESSAGE =
  'Server configuration error: CRON_SECRET is not set.';

/**
 * Gate a cron route. Returns a NextResponse to return immediately when the
 * request must be refused, or `null` when it may proceed.
 *
 *   const authError = verifyCronSecret(request);
 *   if (authError) return authError;
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[cron] CRON_SECRET is not set — REFUSING the request (fail-closed). ' +
          'Set CRON_SECRET in the production environment and in the Vercel cron configuration.'
      );
      return NextResponse.json({ error: CRON_MISCONFIGURED_MESSAGE }, { status: 503 });
    }
    // Development: allow unauthenticated runs so the job can be tested locally.
    return null;
  }

  const header = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return null;
}
