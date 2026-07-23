import { describe, it, expect } from 'vitest';
import { parseVideoUrl, isValidVideoUrl, normalizeVideoUrl } from '@/lib/video';
import { parseInstagramUrl } from '@/lib/video/instagram';

describe('Instagram video — valid links', () => {
  it('accepts a Reel URL and generates a canonical URL', () => {
    const p = parseVideoUrl('https://www.instagram.com/reel/Cabc123_-X/');
    expect(p).not.toBeNull();
    expect(p!.provider).toBe('instagram');
    expect(p!.kind).toBe('reel');
    expect(p!.id).toBe('Cabc123_-X');
    expect(p!.canonicalUrl).toBe('https://www.instagram.com/reel/Cabc123_-X/');
  });

  it('accepts a Post URL', () => {
    const p = parseVideoUrl('https://www.instagram.com/p/CXYZ789/');
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('post');
    expect(p!.canonicalUrl).toBe('https://www.instagram.com/p/CXYZ789/');
  });

  it('isValidVideoUrl is true for post and reel', () => {
    expect(isValidVideoUrl('https://www.instagram.com/p/CXYZ789/')).toBe(true);
    expect(isValidVideoUrl('https://www.instagram.com/reel/CXYZ789/')).toBe(true);
  });
});

describe('Instagram video — normalization', () => {
  it('strips query strings and trailing path to a canonical permalink', () => {
    expect(normalizeVideoUrl('https://www.instagram.com/reel/ABC123/?igshid=xyz&utm_source=ig'))
      .toBe('https://www.instagram.com/reel/ABC123/');
  });

  it('normalizes http, missing www, and m. subdomain to https://www', () => {
    expect(normalizeVideoUrl('http://instagram.com/p/ABC123')).toBe('https://www.instagram.com/p/ABC123/');
    expect(normalizeVideoUrl('https://m.instagram.com/reel/ABC123/')).toBe('https://www.instagram.com/reel/ABC123/');
  });

  it('maps the /reels/ variant onto the canonical /reel/', () => {
    expect(normalizeVideoUrl('https://www.instagram.com/reels/ABC123/')).toBe('https://www.instagram.com/reel/ABC123/');
  });
});

describe('Instagram video — rejected links', () => {
  it('rejects an empty / whitespace value', () => {
    expect(parseVideoUrl('')).toBeNull();
    expect(parseVideoUrl('   ')).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
    expect(parseVideoUrl(undefined)).toBeNull();
    expect(isValidVideoUrl('')).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(parseVideoUrl('not a url')).toBeNull();
    expect(parseVideoUrl('instagram.com/reel/ABC')).toBeNull(); // no scheme
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects a non-Instagram host (incl. lookalikes and the shortener)', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(parseVideoUrl('https://instagram.com.evil.com/p/ABC/')).toBeNull();
    expect(parseVideoUrl('https://instagr.am/p/ABC/')).toBeNull();
  });

  it('rejects profile, stories and explore URLs', () => {
    expect(parseVideoUrl('https://www.instagram.com/some_user/')).toBeNull();
    expect(parseVideoUrl('https://www.instagram.com/stories/user/123/')).toBeNull();
    expect(parseVideoUrl('https://www.instagram.com/explore/tags/x/')).toBeNull();
  });

  it('rejects a /p|reel/ prefix without a valid shortcode', () => {
    expect(parseVideoUrl('https://www.instagram.com/reel/')).toBeNull();
    expect(parseInstagramUrl('https://www.instagram.com/p/has space/')).toBeNull();
  });

  it('normalizeVideoUrl returns null for anything invalid', () => {
    expect(normalizeVideoUrl('https://tiktok.com/@x/video/1')).toBeNull();
    expect(normalizeVideoUrl('')).toBeNull();
  });
});
