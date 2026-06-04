import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

/**
 * Centralized rate limiting backed by Upstash Redis.
 *
 * Edge-compatible (REST transport) so it works in both middleware and Node
 * route handlers. If the Upstash env vars are absent the limiters are disabled
 * and every check FAILS OPEN — keeping local dev and misconfigured previews
 * usable while still protecting production once the vars are set.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const rateLimitEnabled = Boolean(url && token);

if (!rateLimitEnabled && process.env.NODE_ENV === 'production') {
  // Surfaced once per cold start so a prod deploy without Upstash is noticed.
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting is DISABLED (fail-open).'
  );
}

const redis = rateLimitEnabled ? new Redis({ url: url!, token: token! }) : null;

// Per-isolate cache so repeated checks for the same identifier in one warm
// instance don't all round-trip to Redis (recommended by Upstash for edge).
const ephemeralCache = new Map<string, number>();

type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

function build(tokens: number, window: Duration, prefix: string): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `xayr:rl:${prefix}`,
    ephemeralCache,
    analytics: false,
  });
}

/**
 * Named limiters. Tune the (count, window) pairs here in one place.
 *   login    — credential stuffing / brute force on a single account
 *   signup   — mass account creation from one source
 *   donation — payment/donation spam
 *   admin    — abuse of privileged endpoints + admin pages
 */
export const limiters = {
  login: build(5, '60 s', 'login'),
  signup: build(3, '60 s', 'signup'),
  donation: build(10, '60 s', 'donation'),
  admin: build(30, '10 s', 'admin'),
} as const;

export type LimiterName = keyof typeof limiters;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the window resets. */
  reset: number;
}

/**
 * Check (and consume) one token for `identifier` against the named limiter.
 * Returns `success: true` immediately when limiting is disabled (fail-open).
 */
export async function enforceRateLimit(
  name: LimiterName,
  identifier: string
): Promise<RateLimitResult> {
  const limiter = limiters[name];
  if (!limiter) {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  return { success, limit, remaining, reset };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

/** Standard rate-limit response headers (incl. Retry-After in seconds). */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const retryAfter = Math.max(0, Math.ceil((r.reset - Date.now()) / 1000));
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(Math.max(0, r.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
    'Retry-After': String(retryAfter),
  };
}

/** Build a 429 JSON response for use in route handlers. */
export function tooManyRequests(
  r: RateLimitResult,
  message = 'Too many requests. Please try again later.'
): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers: rateLimitHeaders(r) });
}
