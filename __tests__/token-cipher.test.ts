import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptToken, decryptToken, isTokenCipherConfigured, TOKEN_ENC_VERSION } from '@/lib/crypto/token-cipher';

describe('token-cipher — AES-256-GCM at-rest encryption for Click tokens', () => {
  beforeAll(() => {
    process.env.PAYMENT_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
  });

  it('round-trips a token and never exposes the plaintext in the blob', () => {
    const token = '3B1DF3F1-7358-407C-B57F-0F6351310803';
    const { ciphertext, version } = encryptToken(token);
    expect(version).toBe(TOKEN_ENC_VERSION);
    expect(ciphertext).not.toContain(token);
    expect(decryptToken(ciphertext, version)).toBe(token);
  });

  it('uses a fresh IV each call (same input → different ciphertext)', () => {
    expect(encryptToken('x').ciphertext).not.toBe(encryptToken('x').ciphertext);
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const { ciphertext } = encryptToken('secret-token');
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptToken(buf.toString('base64'))).toThrow();
  });

  it('rejects an unknown enc_version', () => {
    const { ciphertext } = encryptToken('t');
    expect(() => decryptToken(ciphertext, 999)).toThrow();
  });

  it('isTokenCipherConfigured tracks the key env (fail-closed when absent)', () => {
    expect(isTokenCipherConfigured()).toBe(true);
    const prev = process.env.PAYMENT_TOKEN_ENC_KEY;
    delete process.env.PAYMENT_TOKEN_ENC_KEY;
    expect(isTokenCipherConfigured()).toBe(false);
    process.env.PAYMENT_TOKEN_ENC_KEY = 'not-32-bytes';
    expect(isTokenCipherConfigured()).toBe(false); // wrong length also fails closed
    process.env.PAYMENT_TOKEN_ENC_KEY = prev;
  });
});
