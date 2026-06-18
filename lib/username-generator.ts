import { sanitizeUsernameInput, isValidUsername } from '@/lib/username';

/**
 * Client-side username suggestion generator — Uzbek-inspired, Reddit-style.
 * Combines random nature / positive / animal / traditional words with a modern
 * word and/or a numeric/underscore suffix. No real first names or surnames; all
 * output is sanitized + validated (lowercase, [a-z0-9_.], 3–30, no reserved).
 *
 * Pure + client-only (uses Math.random) — call from effects/handlers, never
 * during SSR render, to avoid hydration mismatches.
 */

// All lowercased + apostrophe-free so they are valid username fragments
// (e.g. "bog'" → "bog", "qaldirg'och" → "qaldirgoch").
const NATURE = ['bahor', 'quyosh', 'oy', 'yulduz', 'shabnam', 'tong', 'bulut', 'shamol', 'daryo', 'sahro', 'bog', 'tog', 'barg'];
const POSITIVE = ['xayr', 'mehr', 'umid', 'ishonch', 'orzu', 'ezgulik', 'saxovat', 'shodlik', 'tabassum', 'baraka', 'yordam', 'qalb'];
const ANIMALS = ['lochin', 'burgut', 'qaldirgoch', 'kiyik', 'tulpor', 'asalari'];
const TRADITIONAL = ['atlas', 'adras', 'samarqand', 'registon', 'ipak', 'navo', 'zarafshon'];
const MODERN = ['pixel', 'nova', 'orbit', 'echo', 'fusion', 'spark', 'cloud', 'pulse', 'vector', 'core', 'hub', 'one'];

const BASES = [...NATURE, ...POSITIVE, ...ANIMALS, ...TRADITIONAL];

const RESERVED = new Set([
  'admin', 'support', 'xayr', 'api', 'login', 'register', 'campaign', 'campaigns',
  'profile', 'settings', 'notifications', 'donate', 'withdraw', 'dashboard',
  'system', 'help', 'contact', 'u', 'auth',
]);

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]): T => arr[rand(arr.length)];

function ok(name: string): boolean {
  return name.length >= 3 && name.length <= 30 && isValidUsername(name) && !RESERVED.has(name);
}

/** Build one random username. May return '' if it ends up invalid (caller retries). */
function buildOne(): string {
  const parts: string[] = [pick(BASES)];
  // Second part: usually a modern word, sometimes another base.
  parts.push(Math.random() < 0.6 ? pick(MODERN) : pick(BASES));
  // Occasionally a third fragment for variety.
  if (Math.random() < 0.18) parts.push(pick(MODERN));

  const r = Math.random();
  let name: string;
  if (r < 0.18) {
    // underscore between the first word and the rest
    name = `${parts[0]}_${parts.slice(1).join('')}`;
  } else {
    name = parts.join('');
  }

  const s = Math.random();
  if (s < 0.28) name += String(10 + rand(90));        // 2 digits
  else if (s < 0.42) name += String(100 + rand(900)); // 3 digits
  else if (s < 0.52) name += String(2024 + rand(4));  // year-ish 4 digits

  return sanitizeUsernameInput(name);
}

/** Generate `count` fresh, unique, valid random usernames. */
export function randomUsernames(count = 5): string[] {
  const out = new Set<string>();
  let guard = 0;
  while (out.size < count && guard < count * 20) {
    guard++;
    const n = buildOne();
    if (ok(n)) out.add(n);
  }
  return [...out];
}

/**
 * Seed-based suggestions: keep the user's typed word and append modern/numeric
 * suffixes (mehr → mehr24, mehrhub, mehrnova, mehr360, mehrpulse, mehr_uz).
 * Falls back to random if the seed is too short.
 */
export function smartUsernameSuggestions(seed: string, count = 5): string[] {
  const base = sanitizeUsernameInput(seed).replace(/[._]+$/, '');
  if (base.length < 3) return randomUsernames(count);

  const year = new Date().getFullYear();
  const suffixes = ['24', 'hub', 'nova', '360', 'pulse', 'core', 'spark', `_${10 + rand(90)}`, '_uz', String(year)];
  // Shuffle suffixes for variety each call.
  const shuffled = [...suffixes].sort(() => Math.random() - 0.5);

  const out = new Set<string>();
  for (const suf of shuffled) {
    if (out.size >= count) break;
    const n = sanitizeUsernameInput(`${base}${suf}`);
    if (ok(n)) out.add(n);
  }
  // Top up with random combos if the seed produced too few.
  for (const n of randomUsernames(count)) {
    if (out.size >= count) break;
    out.add(n);
  }
  return [...out];
}
