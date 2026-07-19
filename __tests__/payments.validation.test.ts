import { describe, it, expect } from 'vitest';
import { validatePaymentAmount, validateCurrency, DEFAULT_CURRENCY } from '@/lib/payments/helpers';

describe('validatePaymentAmount', () => {
  it('accepts an exact integer match', () => {
    expect(validatePaymentAmount(50000, 50000)).toBe(true);
  });

  it('rejects any mismatch', () => {
    expect(validatePaymentAmount(49999, 50000)).toBe(false);
    expect(validatePaymentAmount(50001, 50000)).toBe(false);
  });

  it('rejects non-integer amounts (no fractional so\'m)', () => {
    expect(validatePaymentAmount(50000.5, 50000)).toBe(false);
    expect(validatePaymentAmount(50000, 50000.5)).toBe(false);
  });
});

describe('validateCurrency', () => {
  it('accepts the platform currency case/space-insensitively', () => {
    expect(validateCurrency('UZS')).toBe(true);
    expect(validateCurrency('uzs')).toBe(true);
    expect(validateCurrency('  UZS  ')).toBe(true);
    expect(DEFAULT_CURRENCY).toBe('UZS');
  });

  it('rejects any other currency', () => {
    expect(validateCurrency('USD')).toBe(false);
    expect(validateCurrency('')).toBe(false);
  });
});
