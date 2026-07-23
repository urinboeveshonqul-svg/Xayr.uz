import { parseInstagramUrl } from './instagram';

/**
 * Provider-agnostic video-link layer. Campaign code depends ONLY on this module
 * (parseVideoUrl / isValidVideoUrl / normalizeVideoUrl) — never on a specific
 * provider — so adding YouTube, TikTok, etc. later is a one-line registry change
 * plus a new `lib/video/<provider>.ts`, with no change to campaign logic.
 *
 * We link OUT to the post (opened in a new tab) rather than embedding it — no
 * iframe, no third-party embed script, no CSP frame allowance.
 */

export type VideoProviderId = 'instagram';

export interface ParsedVideo {
  provider: VideoProviderId;
  /** Provider-native id (Instagram shortcode). */
  id: string;
  kind: 'post' | 'reel';
  /** Canonical, query-free permalink to persist AND open in a new tab. */
  canonicalUrl: string;
}

export type VideoParser = (input: string) => ParsedVideo | null;

// Ordered registry of provider parsers. To add a provider: implement its parser
// in lib/video/<provider>.ts and append it here.
const PROVIDERS: readonly VideoParser[] = [parseInstagramUrl];

/** First provider that recognizes the URL wins; null when none do. */
export function parseVideoUrl(input: string | null | undefined): ParsedVideo | null {
  if (!input) return null;
  for (const parse of PROVIDERS) {
    const parsed = parse(input);
    if (parsed) return parsed;
  }
  return null;
}

/** True only for a URL a registered provider can embed. Empty/undefined ⇒ false. */
export function isValidVideoUrl(input: string | null | undefined): boolean {
  return parseVideoUrl(input) !== null;
}

/**
 * Canonical URL to store, or null when the input is empty OR not a recognized
 * video link. Callers treat null as "no video".
 */
export function normalizeVideoUrl(input: string | null | undefined): string | null {
  return parseVideoUrl(input)?.canonicalUrl ?? null;
}
