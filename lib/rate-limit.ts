import { NextResponse } from 'next/server';

/**
 * Centralized rate limiting backed by Upstash Redis.
 *
 * Design goal: rate limiting must NEVER take down the site. Every failure mode
 * — missing env vars, missing/broken @upstash packages, network errors, bad
 * credentials — FAILS OPEN (the request is allowed). The Upstash client is
 * created lazily inside a try/catch so importing this module can never throw at
 * middleware load time. Edge- and Node-runtime compatible.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const rateLimitEnabled = Boolean(url && token);

export type LimiterName =
  | 'login'
  | 'signup'
  | 'reset'
  | 'donation'
  | 'campaign'
  | 'contact'
  | 'search'
  | 'notifications'
  | 'admin'
  | 'views';

// (count, window) per limiter — tune here in one place. Limits are intentionally
// generous so they curb scripted abuse without tripping on normal human usage.
const CONFIG: Record<LimiterName, { tokens: number; window: `${number} ${'s' | 'm' | 'h'}` }> = {
  login: { tokens: 5, window: '60 s' },
  signup: { tokens: 3, window: '60 s' },
  reset: { tokens: 3, window: '60 s' },        // password-reset emails (anti-bombing)
  donation: { tokens: 10, window: '60 s' },
  campaign: { tokens: 5, window: '60 s' },      // campaign creation
  contact: { tokens: 3, window: '60 s' },       // contact form
  search: { tokens: 20, window: '60 s' },       // search queries (human refines a few/min)
  notifications: { tokens: 30, window: '60 s' }, // notifications page loads
  admin: { tokens: 30, window: '10 s' },
  views: { tokens: 5, window: '1 h' },
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the window resets. */
  reset: number;
}

const ALLOW: RateLimitResult = { success: true, limit: 0, remaining: 0, reset: 0 };

// Lazily-initialized limiters. `null` once we know limiting is unavailable.
type LimiterMap = Record<LimiterName, { limit(id: string): Promise<RateLimitResult> }>;
let limitersPromise: Promise<LimiterMap | null> | null = null;
let warned = false;

async function getLimiters(): Promise<LimiterMap | null> {
  if (!rateLimitEnabled) {
    if (!warned && process.env.NODE_ENV === 'production') {
      warned = true;
      console.warn('[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting disabled (fail-open).');
    }
    return null;
  }
  if (!limitersPromise) {
    limitersPromise = (async () => {
      try {
        // Dynamic import so a missing package can't crash module load.
        const [{ Ratelimit }, { Redis }] = await Promise.all([
          import('@upstash/ratelimit'),
          import('@upstash/redis'),
        ]);
        const redis = new Redis({ url: url!, token: token! });
        const cache = new Map<string, number>();
        const make = (name: LimiterName) =>
          new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(CONFIG[name].tokens, CONFIG[name].window),
            prefix: `xayr:rl:${name}`,
            ephemeralCache: cache,
            analytics: false,
          });
        return {
          login: make('login'),
          signup: make('signup'),
          reset: make('reset'),
          donation: make('donation'),
          campaign: make('campaign'),
          contact: make('contact'),
          search: make('search'),
          notifications: make('notifications'),
          admin: make('admin'),
          views: make('views'),
        };
      } catch (err) {
        console.error('[rate-limit] init failed — disabling (fail-open):', err);
        return null;
      }
    })();
  }
  return limitersPromise;
}

/**
 * Check (and consume) one token for `identifier`. Returns `success: true`
 * whenever limiting is unavailable or errors — i.e. it fails open.
 */
export async function enforceRateLimit(
  name: LimiterName,
  identifier: string
): Promise<RateLimitResult> {
  try {
    const limiters = await getLimiters();
    if (!limiters) return ALLOW;
    const { success, limit, remaining, reset } = await limiters[name].limit(identifier);
    return { success, limit, remaining, reset };
  } catch (err) {
    console.error('[rate-limit] check failed — allowing request:', err);
    return ALLOW;
  }
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

/**
 * Reusable one-call guard for API route handlers. Rate-limits by client IP
 * (optionally namespaced by `keySuffix`, e.g. a username or campaign id) and
 * returns a ready 429 `NextResponse` when the limit is exceeded, or `null` when
 * the request may proceed. Fails open (returns null) when limiting is disabled.
 *
 *   const limited = await rateLimitOr429(request, 'contact');
 *   if (limited) return limited;
 */
export async function rateLimitOr429(
  request: Request,
  name: LimiterName,
  opts?: { keySuffix?: string; message?: string }
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const id = opts?.keySuffix ? `${name}:${ip}:${opts.keySuffix}` : `${name}:${ip}`;
  const rl = await enforceRateLimit(name, id);
  if (!rl.success) return tooManyRequests(rl, opts?.message);
  return null;
}
