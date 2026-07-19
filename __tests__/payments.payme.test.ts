import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyPaymeAuth,
  somToTiyin,
  tiyinToSom,
  isPaymeConfigured,
} from '@/lib/payments/providers/payme';

const KEY = 'payme_merchant_key';

function basicHeader(login: string, password: string): string {
  return 'Basic ' + Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
}

describe('Payme merchant-API auth verification', () => {
  beforeEach(() => {
    process.env.PAYME_SECRET_KEY = KEY;
  });

  it('accepts the correct merchant key (login is ignored)', () => {
    expect(verifyPaymeAuth(basicHeader('Paycom', KEY))).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyPaymeAuth(basicHeader('Paycom', 'wrong_key'))).toBe(false);
  });

  it('rejects a missing / malformed header', () => {
    expect(verifyPaymeAuth(null)).toBe(false);
    expect(verifyPaymeAuth('')).toBe(false);
    expect(verifyPaymeAuth('Bearer ' + KEY)).toBe(false);
    expect(verifyPaymeAuth('Basic ' + Buffer.from('no-colon', 'utf8').toString('base64'))).toBe(false);
  });

  it('fails closed when no key is configured', () => {
    delete process.env.PAYME_SECRET_KEY;
    expect(verifyPaymeAuth(basicHeader('Paycom', KEY))).toBe(false);
  });
});

describe('Payme amount conversion (so\'m <-> tiyin)', () => {
  it('converts so\'m to tiyin (x100)', () => {
    expect(somToTiyin(50000)).toBe(5_000_000);
    expect(somToTiyin(1)).toBe(100);
  });

  it('round-trips tiyin back to so\'m', () => {
    expect(tiyinToSom(5_000_000)).toBe(50000);
    expect(tiyinToSom(somToTiyin(12345))).toBe(12345);
  });
});

describe('isPaymeConfigured', () => {
  it('requires BOTH merchant id and key', () => {
    process.env.PAYME_MERCHANT_ID = 'm';
    process.env.PAYME_SECRET_KEY = 'k';
    expect(isPaymeConfigured()).toBe(true);
    delete process.env.PAYME_MERCHANT_ID;
    expect(isPaymeConfigured()).toBe(false);
  });
});
