/**
 * Username helpers — single source of truth for how usernames are formatted,
 * validated, and displayed. Usernames are STORED bare (no @); the @ is added
 * ONLY for display via displayUsername(). Never persist the @.
 */

/** Add the @ for UI display. Returns '' for empty/null. */
export function displayUsername(username?: string | null): string {
  return username ? `@${username}` : '';
}

/**
 * Clean raw input while typing/pasting:
 * lowercases, removes @, drops spaces/specials/emoji, collapses repeated
 * dots/underscores, caps at 30. Does NOT trim leading/trailing dots (so the
 * user can type "a.b") — validation flags those instead.
 */
export function sanitizeUsernameInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/_{2,}/g, '_')
    .slice(0, 30);
}

/**
 * Full validity for a candidate (already sanitized or not). Rejects bad length,
 * leading/trailing periods, and consecutive periods/underscores.
 */
export function isValidUsername(username: string): boolean {
  const u = username.toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(u)) return false;
  if (u.startsWith('.') || u.endsWith('.')) return false;
  if (u.includes('..') || u.includes('__')) return false;
  return true;
}

/**
 * Normalize a login identifier: trim, and strip a single leading @ so
 * "@hakimova80" logs in the same as "hakimova80". Emails are left intact
 * (they have no leading @). Lowercasing of usernames happens at lookup time.
 */
export function normalizeLoginIdentifier(identifier: string): string {
  const t = identifier.trim();
  return t.startsWith('@') ? t.slice(1) : t;
}
