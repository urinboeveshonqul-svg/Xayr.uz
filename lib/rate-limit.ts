import { NextResponse } from 'next/server';

/**
 * Centralized rate limiting backed by Upstash Redis.
 *
 * Failure philosophy (mirrors lib/security/turnstile):
 *
 *   • NOT CONFIGURED / init failure, PRODUCTION → FAIL CLOSED (503 config error).
 *     Running production with no rate limiting is itself a vulnerability: login
 *     brute-force, signup/donation spam and password-reset bombing all become
 *     unbounded, silently, behind a single log line.
 *   • NOT CONFIGURED, DEVELOPMENT → fail OPEN (warn) so local development needs
 *     no Upstash account.
 *   • Transient runtime error on an individual .limit() call → fail OPEN.
 *     Deliberate and distinct from "not configured": a Redis blip must not lock
 *     users out of the whole site, whereas an absent configuration is an
 *     operator error that must be surfaced loudly.
 *
 * The Upstash client is created lazily inside a try/catch so importing this
 * module can never throw at middleware load time. Edge- and Node-runtime
 * compatible.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const rateLimitEnabled = Boolean(url && token);

/** Production fails closed when rate limiting is unavailable; dev fails open. */
const FAIL_CLOSED = process.env.NODE_ENV === 'production';

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
  /**
   * True when the request was refused because rate limiting is NOT CONFIGURED
   * in production. Distinct from an exhausted quota: callers must answer 503
   * (server misconfiguration), never 429 (blame the user), and must not send a
   * Retry-After — no amount of waiting fixes an unset env var.
   */
  configError?: boolean;
}

const ALLOW: RateLimitResult = { success: true, limit: 0, remaining: 0, reset: 0 };
const CONFIG_ERROR: RateLimitResult = {
  success: false,
  limit: 0,
  remaining: 0,
  reset: 0,
  configError: true,
};

/** Rate limiting is unavailable: refuse in production, allow locally. */
function unavailable(): RateLimitResult {
  return FAIL_CLOSED ? CONFIG_ERROR : ALLOW;
}

// Lazily-initialized limiters. `null` once we know limiting is unavailable.
type LimiterMap = Record<LimiterName, { limit(id: string): Promise<RateLimitResult> }>;
let limitersPromise: Promise<LimiterMap | null> | null = null;
let warned = false;

async function getLimiters(): Promise<LimiterMap | null> {
  if (!rateLimitEnabled) {
    if (!warned) {
      warned = true;
      if (FAIL_CLOSED) {
        console.error(
          '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — REFUSING rate-limited requests ' +
            '(fail-closed). Set both in the production environment.'
        );
      } else {
        console.warn('[rate-limit] Upstash not configured — rate limiting disabled (dev fail-open).');
      }
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
        // Bad credentials / missing package — a configuration problem, so it is
        // treated exactly like "not configured" (fail closed in production).
        console.error('[rate-limit] init failed — treating as unconfigured:', err);
        return null;
      }
    })();
  }
  return limitersPromise;
}

/**
 * Check (and consume) one token for `identifier`.
 *
 * Unavailable (unconfigured / init failed) → refused in production with
 * `configError`, allowed in development. A transient error on the call itself
 * still fails open, so a Redis blip never takes the site down.
 */
export async function enforceRateLimit(
  name: LimiterName,
  identifier: string
): Promise<RateLimitResult> {
  let limiters: LimiterMap | null;
  try {
    limiters = await getLimiters();
  } catch (err) {
    console.error('[rate-limit] limiter init threw — treating as unconfigured:', err);
    return unavailable();
  }
  if (!limiters) return unavailable();

  try {
    const { success, limit, remaining, reset } = await limiters[name].limit(identifier);
    return { success, limit, remaining, reset };
  } catch (err) {
    // Transient Redis/network failure — allow, so an outage can't lock the site.
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

/** Shown when rate limiting is unavailable in production — NOT a quota message. */
export const RATE_LIMIT_MISCONFIGURED_MESSAGE =
  'Server configuration error: request throttling is unavailable. Please try again later.';

/**
 * Standard rate-limit response headers (incl. Retry-After in seconds).
 * Returns nothing for a config error: the quota counters are meaningless and
 * Retry-After would promise a recovery that waiting cannot deliver.
 */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  if (r.configError) return {};
  const retryAfter = Math.max(0, Math.ceil((r.reset - Date.now()) / 1000));
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(Math.max(0, r.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
    'Retry-After': String(retryAfter),
  };
}

/**
 * Build the rejection response for an unsuccessful RateLimitResult.
 *
 *  - misconfigured (production, no Upstash) → 503, server's fault
 *  - quota exhausted                        → 429, unchanged from before
 */
export function tooManyRequests(
  r: RateLimitResult,
  message = 'Too many requests. Please try again later.'
): NextResponse {
  if (r.configError) {
    return NextResponse.json({ error: RATE_LIMIT_MISCONFIGURED_MESSAGE }, { status: 503 });
  }
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
