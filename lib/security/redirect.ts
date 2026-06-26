// ============================================================
// Open-redirect guard for post-auth `next` / redirect targets.
//
// Returns a SAFE internal path: a relative path on our own origin, or the
// fallback ('/' by default) when the input is missing, external, or malformed.
// It NEVER returns an absolute or protocol-relative URL, so callers can append
// it to a known origin (or hand it to the router) without enabling an open
// redirect to an attacker-controlled host.
//
// Isomorphic - pure string logic, no Node/Web APIs - so the auth callback
// (server) and the login form (client) share exactly one source of truth.
// ============================================================

/**
 * Validate a user-supplied redirect target.
 *
 * Allows only: a relative path beginning with a single '/'.
 * Rejects (falls back):
 *   - external URLs            https://evil, http://evil, mailto:, javascript:
 *   - protocol-relative        //evil.com
 *   - backslash-smuggled       /\evil.com, /\/evil.com (browsers normalise \ to /)
 *   - control chars / CR-LF    header-injection attempts
 *   - empty / non-string       null, undefined, ''
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  // Must be a relative path with exactly one leading slash.
  if (raw[0] !== '/') return fallback;
  // Reject protocol-relative ('//host') outright.
  if (raw[1] === '/') return fallback;
  // Reject any backslash (smuggled protocol-relative) or ASCII control char
  // (NUL through US, plus DEL) used for header-injection / redirect smuggling.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c /* backslash */) return fallback;
  }
  return raw;
}
