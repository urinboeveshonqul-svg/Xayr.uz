import { describe, it, expect } from 'vitest';
import {
  calcPlatformFee,
  calcNetPayout,
  PLATFORM_FEE_RATE,
  MIN_WITHDRAWAL,
  isValidCard,
  maskCard,
  maskCardDisplay,
} from '@/lib/payout';

describe('withdrawal commission (mirrors create_payout_request round(amount * 0.04))', () => {
  it('charges 4% of the gross', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.04);
    expect(calcPlatformFee(100000)).toBe(4000);
    expect(calcPlatformFee(50000)).toBe(2000);
  });

  it('rounds to the nearest so\'m, matching the DB round()', () => {
    // 12345 * 0.04 = 493.8 -> 494
    expect(calcPlatformFee(12345)).toBe(494);
  });

  it('net + fee always reconciles to the gross (DB CHECK commission+payout=amount)', () => {
    for (const amount of [MIN_WITHDRAWAL, 50000, 100000, 12345, 999_999]) {
      expect(calcPlatformFee(amount) + calcNetPayout(amount)).toBe(amount);
    }
  });

  it('the creator receives the gross minus the fee', () => {
    expect(calcNetPayout(100000)).toBe(96000);
  });
});

describe('minimum withdrawal (must match v_min in create_payout_request)', () => {
  it('is 50,000 so\'m', () => {
    expect(MIN_WITHDRAWAL).toBe(50000);
  });
});

describe('card validation + masking (never stores CVV/PIN/expiry)', () => {
  it('accepts 16 digits, rejects fewer', () => {
    expect(isValidCard('8600123412341234')).toBe(true);
    expect(isValidCard('8600 1234 1234 1234')).toBe(true); // spaces stripped
    expect(isValidCard('12345')).toBe(false);
    expect(isValidCard('860012341234123')).toBe(false); // 15 digits
  });

  it('masks all but the last 4 for general display', () => {
    expect(maskCard('8600123412349012')).toBe('•••• •••• •••• 9012');
  });

  it('shows BIN + last 4 for the owner display', () => {
    expect(maskCardDisplay('8600123412349012')).toBe('8600 **** **** 9012');
  });
});
