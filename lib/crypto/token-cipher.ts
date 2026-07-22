import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ============================================================
// Application-layer encryption for at-rest secrets — SERVER ONLY.
//
// Used to encrypt saved Click card tokens before they are stored in
// `saved_payment_methods.token_ciphertext`. AES-256-GCM (authenticated
// encryption): tampering with the ciphertext fails decryption rather than
// yielding a wrong plaintext.
//
// Key: PAYMENT_TOKEN_ENC_KEY — a 32-byte key, base64-encoded, server-only env
// (NEVER NEXT_PUBLIC_*). Generate with: `openssl rand -base64 32`.
//
// Blob layout (base64): iv[12] ‖ authTag[16] ‖ ciphertext.
// `enc_version` is stored alongside the blob so the scheme/key can be rotated
// later (decrypt dispatches on the stored version).
//
// This module must never be imported by a client component — it reads the
// secret key and performs decryption, both of which are backend-only.
// ============================================================

const ENC_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

/** The 32-byte AES key. Throws (fail-closed) if the env is missing/malformed. */
function encryptionKey(): Buffer {
  const b64 = process.env.PAYMENT_TOKEN_ENC_KEY;
  if (!b64) throw new Error('PAYMENT_TOKEN_ENC_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('PAYMENT_TOKEN_ENC_KEY must decode to 32 bytes (use `openssl rand -base64 32`)');
  }
  return key;
}

/** True when a valid encryption key is configured — gates the saved-cards feature. */
export function isTokenCipherConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a token; returns the base64 blob + the scheme version to store with it. */
export function encryptToken(plaintext: string): { ciphertext: string; version: number } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, ct]).toString('base64'),
    version: ENC_VERSION,
  };
}

/** Decrypt a stored blob. Throws on a bad key, tampering, or unknown version. */
export function decryptToken(blobB64: string, version: number = ENC_VERSION): string {
  if (version !== ENC_VERSION) throw new Error(`unsupported enc_version ${version}`);
  const blob = Buffer.from(blobB64, 'base64');
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export const TOKEN_ENC_VERSION = ENC_VERSION;
