// ============================================================
// Constant-time secret comparison. SERVER / NODE RUNTIME ONLY.
//
// Plain `a === b` (or `!==`) on secrets short-circuits at the first differing
// byte, leaking — via response timing — how many leading bytes of a guessed
// secret are correct. crypto.timingSafeEqual compares in time independent of
// where the first difference is, closing that side channel.
//
// Use for: webhook shared secrets, API keys, HMAC signatures, opaque tokens.
// Never import into edge/middleware or client code (uses node:crypto).
// ============================================================

import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

/**
 * Timing-safe equality for two strings.
 *
 * Requirements honoured:
 *   • compares equal-length buffers only (timingSafeEqual throws otherwise);
 *   • fails securely (returns false) when lengths differ — the configured
 *     secret length is fixed, so the length itself is not secret-derived;
 *   • never short-circuits on content, so it leaks no positional timing.
 *
 * Returns false for any null/undefined input rather than throwing.
 */
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return nodeTimingSafeEqual(bufA, bufB);
}
