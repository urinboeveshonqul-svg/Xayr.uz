// ============================================================
// Cloudflare Turnstile — server-side verification. SERVER-ONLY.
//
// The client widget produces a single-use token; this module verifies it
// against Cloudflare before the protected action runs. The token is NEVER
// trusted on its own — verification always happens here, server-side.
//
// Failure philosophy (mirrors lib/rate-limit):
//   • secret NOT set, PRODUCTION → fail CLOSED (configuration error). Silently
//                             skipping bot protection in production is itself a
//                             vulnerability: it disables Turnstile on signup,
//                             login, password reset, contact, campaign creation
//                             and guest donations with nothing but a log line.
//   • secret NOT set, DEV    → fail OPEN (skipped) so local development needs no
//                             Cloudflare account.
//   • secret set, no token  → fail CLOSED (block) — the common bot case.
//   • secret set, bad token → fail CLOSED (block).
//   • Cloudflare unreachable → fail OPEN (allow) so a CF outage can't lock users
//                             out of login/signup. Logged for visibility. This is
//                             a deliberate availability trade-off and is distinct
//                             from "not configured", which is an operator error.
// ============================================================

import { NextResponse } from 'next/server';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Canonical user-facing message shown whenever Turnstile verification fails. */
export const TURNSTILE_FAILED_MESSAGE = 'Security verification failed. Please try again.';

/** Shown when the server is misconfigured — NOT the bot-failure message. */
export const TURNSTILE_MISCONFIGURED_MESSAGE =
  'Server configuration error: bot protection is unavailable. Please try again later.';

export interface TurnstileResult {
  /** True when the request may proceed (verified, or intentionally skipped). */
  success: boolean;
  /** True when verification was skipped because no secret is configured (dev only). */
  skipped: boolean;
  /**
   * True when the request was refused because Turnstile is NOT CONFIGURED in
   * production. Distinct from a failed challenge: the caller must answer 503
   * (server misconfiguration), never 400 (blame the user).
   */
  configError?: boolean;
  /** Cloudflare error codes (or an internal reason), for logging. */
  reason?: string;
}

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verify a Turnstile token. Pass the client IP (from getClientIp) when available
 * so Cloudflare can factor it into scoring.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Not configured. In production this is an operator error, not a user error —
  // fail CLOSED so bot protection is never silently absent. Locally, skip so
  // development needs no Cloudflare account.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[turnstile] TURNSTILE_SECRET_KEY is not set — REFUSING the request (fail-closed). ' +
          'Set TURNSTILE_SECRET_KEY in the production environment.'
      );
      return { success: false, skipped: false, configError: true, reason: 'not-configured' };
    }
    return { success: true, skipped: true, reason: 'not-configured-dev' };
  }

  if (!token) {
    return { success: false, skipped: false, reason: 'missing-token' };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as SiteverifyResponse;
    return {
      success: !!data.success,
      skipped: false,
      reason: data['error-codes']?.join(',') || undefined,
    };
  } catch (err) {
    // Couldn't reach Cloudflare — don't take auth/contact down over a CF blip.
    console.error('[turnstile] verification request failed — allowing (fail-open):', err);
    return { success: true, skipped: true, reason: 'verify-error' };
  }
}

/**
 * Build the correct rejection response for a failed TurnstileResult, so every
 * caller answers identically and the config case is never mistaken for a bot.
 *
 *   const ts = await verifyTurnstile(tokenFromBody(body), ip);
 *   if (!ts.success) return turnstileFailureResponse(ts);
 *
 *  - misconfigured (production, no secret) → 503, server's fault
 *  - failed / missing challenge            → 400, unchanged from before
 */
export function turnstileFailureResponse(result: TurnstileResult): NextResponse {
  if (result.configError) {
    return NextResponse.json({ error: TURNSTILE_MISCONFIGURED_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: TURNSTILE_FAILED_MESSAGE }, { status: 400 });
}

/** Read the Turnstile token from a parsed JSON body, regardless of extra fields. */
export function tokenFromBody(body: unknown): string | null {
  if (body && typeof body === 'object' && 'turnstileToken' in body) {
    const t = (body as { turnstileToken?: unknown }).turnstileToken;
    return typeof t === 'string' ? t : null;
  }
  return null;
}
