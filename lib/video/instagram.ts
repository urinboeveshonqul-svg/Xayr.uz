import type { ParsedVideo } from './index';

/**
 * Instagram video provider — validation, normalization and embed-URL generation
 * for public Instagram Post and Reel links.
 *
 * We deliberately do NOT host or embed video ourselves; a creator pastes an
 * Instagram permalink and the campaign page links out to it. This module is pure
 * (isomorphic) so both the client forms (instant feedback) and the server create
 * route (authoritative validation) use it.
 *
 * ACCEPTED  https://www.instagram.com/p/<shortcode>/      (post)
 *           https://www.instagram.com/reel/<shortcode>/   (reel)
 *           (also http, no-www, m., trailing junk path, query string — normalized)
 * REJECTED  non-Instagram hosts, profile URLs (/<user>), stories, explore,
 *           malformed URLs, and anything without a valid /p/ or /reel/ shortcode.
 */

// Only Instagram's own hosts — an Instagram shortener (instagr.am) or any other
// host cannot be validated to a canonical post/reel, so it is rejected.
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

// Instagram shortcodes are URL-safe base64-ish tokens. Bounded to avoid absurd input.
const SHORTCODE = /^[A-Za-z0-9_-]{1,64}$/;

/** Parse an Instagram post/reel URL, or return null if it is not a valid one. */
export function parseInstagramUrl(input: string): ParsedVideo | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // malformed URL
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;

  // First two path segments decide the kind: `p` (post) or `reel`/`reels` (reel).
  // A profile URL (/<username>) has no such prefix and is rejected; so are
  // /stories/, /explore/, etc.
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const typeSegment = segments[0].toLowerCase();
  const kind: ParsedVideo['kind'] | null =
    typeSegment === 'p' ? 'post' : typeSegment === 'reel' || typeSegment === 'reels' ? 'reel' : null;
  if (!kind) return null;

  const shortcode = segments[1];
  if (!SHORTCODE.test(shortcode)) return null;

  const pathType = kind === 'post' ? 'p' : 'reel';
  return {
    provider: 'instagram',
    id: shortcode,
    kind,
    // Canonical, query-free permalink — stored in the DB and opened in a new tab.
    canonicalUrl: `https://www.instagram.com/${pathType}/${shortcode}/`,
  };
}
