import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ============================================================
// Payout instrument encryption — AES-256-GCM. SERVER-ONLY.
//
// Application-layer encryption: sensitive payout details (today a card number,
// later an IBAN / bank account) are encrypted in Node BEFORE they reach Postgres
// and decrypted only inside admin-gated server routes. The database therefore
// only ever holds ciphertext plus a non-sensitive `last4` for display.
//
// WHY APPLICATION-LAYER AND NOT pgcrypto / Supabase Vault
//   The key never enters the database. A database dump, backup, read replica,
//   RLS misconfiguration, SQL injection, leaked SUPABASE_SERVICE_ROLE_KEY or
//   Supabase dashboard session yields CIPHERTEXT ONLY. With an in-database key
//   (pgcrypto + Vault) anything able to run privileged SQL can read the key and
//   decrypt everything — which does not mitigate the most realistic breach for
//   this stack (a leaked service-role key). pgsodium/TCE is additionally
//   deprecated by Supabase and was rejected outright.
//
// ENVELOPE
//   base64( iv(12) || authTag(16) || ciphertext )
//   Stored in a `text` column (not bytea) so it round-trips through PostgREST
//   and supabase-js without binary-encoding ambiguity. `key_version` is stored
//   in its own column so keys can be rotated without touching the payload.
//
// GCM is AEAD: tampering with stored ciphertext fails the auth-tag check and
// throws on decrypt rather than returning corrupted data.
//
// ⚠️ NEVER import this into a Client Component. The key is server-only and must
// never be prefixed NEXT_PUBLIC_.
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

/** Current key version written to new records. Bump alongside a new key env var. */
export const CURRENT_KEY_VERSION = 1;

/** Env var per key version, so rotation can decrypt old rows with the old key. */
function keyEnvName(version: number): string {
  return version === 1 ? 'PAYOUT_ENCRYPTION_KEY' : `PAYOUT_ENCRYPTION_KEY_V${version}`;
}

/**
 * Load and validate the key for a version. Throws loudly: a misconfigured key
 * must fail the request, never silently fall back to storing plaintext.
 */
function loadKey(version: number): Buffer {
  const name = keyEnvName(version);
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`[payout-crypto] ${name} is not set — cannot encrypt/decrypt payout data.`);
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(`[payout-crypto] ${name} is not valid base64.`);
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[payout-crypto] ${name} must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Generate with: openssl rand -base64 32'
    );
  }
  return key;
}

/** True when the current key is configured — lets callers degrade explicitly. */
export function isPayoutCryptoConfigured(): boolean {
  try {
    loadKey(CURRENT_KEY_VERSION);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a JSON-serialisable secret payload with the CURRENT key.
 *
 * The payload is an object, not a bare string, so new payout instruments need no
 * schema change:
 *   card → { card_number: '8600…' }
 *   bank → { iban: 'UZ…', account_number: '…' }
 */
export function encryptSecret(payload: Record<string, string>): {
  ciphertext: string;
  keyVersion: number;
} {
  const key = loadKey(CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, encrypted]).toString('base64'),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/**
 * Decrypt a payload produced by encryptSecret, using the key for `keyVersion`.
 * Throws on a wrong key, a truncated envelope, or tampered ciphertext (GCM auth
 * failure) — callers must treat a throw as "cannot reveal", never as "empty".
 */
export function decryptSecret(ciphertext: string, keyVersion: number): Record<string, string> {
  const key = loadKey(keyVersion);
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('[payout-crypto] ciphertext envelope is too short / malformed.');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as Record<string, string>;
}

/** Non-sensitive last-4 for display. Stored alongside the ciphertext. */
export function last4(digits: string): string {
  const d = (digits || '').replace(/\D/g, '');
  return d.slice(-4);
}
