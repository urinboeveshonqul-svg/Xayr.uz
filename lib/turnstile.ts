// ============================================================
// Cloudflare Turnstile — server-side verification. SERVER-ONLY.
//
// The client widget produces a single-use token; this module verifies it
// against Cloudflare before the protected action runs. The token is NEVER
// trusted on its own — verification always happens here, server-side.
//
// Failure philosophy (mirrors lib/rate-limit):
//   • secret NOT set        → fail OPEN (skipped) so dev / not-yet-configured
//                             environments keep working.
//   • secret set, no token  → fail CLOSED (block) — the common bot case.
//   • secret set, bad token → fail CLOSED (block).
//   • Cloudflare unreachable → fail OPEN (allow) so a CF outage can't lock users
//                             out of login/signup. Logged for visibility.
// ============================================================

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  /** True when the request may proceed (verified, or intentionally skipped). */
  success: boolean;
  /** True when verification was skipped because no secret is configured. */
  skipped: boolean;
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

  // Not configured → skip (fail open). Warn once-ish in production.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (fail-open).');
    }
    return { success: true, skipped: true };
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

/** Read the Turnstile token from a parsed JSON body, regardless of extra fields. */
export function tokenFromBody(body: unknown): string | null {
  if (body && typeof body === 'object' && 'turnstileToken' in body) {
    const t = (body as { turnstileToken?: unknown }).turnstileToken;
    return typeof t === 'string' ? t : null;
  }
  return null;
}
