import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  verifyClickSignature,
  parseClickCallback,
  derivePrepareId,
  CLICK_ACTION_PREPARE,
  CLICK_ACTION_COMPLETE,
  type ClickCallbackParams,
} from '@/lib/payments/providers/click';

const SECRET = 'click_secret_key';

/** Build a Click callback with a VALID MD5 signature for the given secret. */
function signedCallback(overrides: Partial<ClickCallbackParams> = {}): ClickCallbackParams {
  const p: ClickCallbackParams = {
    click_trans_id: '1000001',
    service_id: '12345',
    click_paydoc_id: '99',
    merchant_trans_id: 'click_11111111-2222-3333-4444-555555555555',
    merchant_prepare_id: null,
    amount: '50000.00',
    action: CLICK_ACTION_PREPARE,
    error: '0',
    error_note: '',
    sign_time: '2026-01-01 10:00:00',
    sign_string: '',
    ...overrides,
  };
  const prepareId = p.action === CLICK_ACTION_COMPLETE ? (p.merchant_prepare_id ?? '') : '';
  const base = `${p.click_trans_id}${p.service_id}${SECRET}${p.merchant_trans_id}${prepareId}${p.amount}${p.action}${p.sign_time}`;
  p.sign_string = createHash('md5').update(base).digest('hex');
  return p;
}

describe('Click callback verification', () => {
  it('accepts a correctly-signed Prepare callback', () => {
    const p = signedCallback();
    expect(verifyClickSignature(p, SECRET)).toBe(true);
  });

  it('accepts a correctly-signed Complete callback (includes merchant_prepare_id)', () => {
    const p = signedCallback({ action: CLICK_ACTION_COMPLETE, merchant_prepare_id: '42' });
    expect(verifyClickSignature(p, SECRET)).toBe(true);
  });

  it('rejects a wrong secret key', () => {
    const p = signedCallback();
    expect(verifyClickSignature(p, 'not_the_secret')).toBe(false);
  });

  it('rejects a tampered amount (signature no longer matches)', () => {
    const p = signedCallback();
    const tampered = { ...p, amount: '1.00' };
    expect(verifyClickSignature(tampered, SECRET)).toBe(false);
  });

  it('is case-insensitive on the provided signature hex', () => {
    const p = signedCallback();
    const upper = { ...p, sign_string: p.sign_string.toUpperCase() };
    expect(verifyClickSignature(upper, SECRET)).toBe(true);
  });
});

describe('parseClickCallback', () => {
  it('parses a complete form body', () => {
    const form = new URLSearchParams({
      click_trans_id: '1',
      service_id: '2',
      merchant_trans_id: 'click_x',
      amount: '1000.00',
      action: '0',
      sign_time: 't',
      sign_string: 's',
    });
    const parsed = parseClickCallback(form);
    expect(parsed).not.toBeNull();
    expect(parsed?.merchant_trans_id).toBe('click_x');
    expect(parsed?.error).toBe('0'); // defaulted
  });

  it('returns null when a required field is missing', () => {
    const form = new URLSearchParams({
      click_trans_id: '1',
      service_id: '2',
      // merchant_trans_id missing
      amount: '1000.00',
      action: '0',
      sign_time: 't',
      sign_string: 's',
    });
    expect(parseClickCallback(form)).toBeNull();
  });
});

describe('derivePrepareId', () => {
  it('is deterministic for a given donation id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(derivePrepareId(id)).toBe(derivePrepareId(id));
  });

  it('always fits a signed 32-bit int (Click truncates otherwise)', () => {
    for (const id of [
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '00000000-0000-0000-0000-000000000000',
      '89abcdef-0123-4567-89ab-cdef01234567',
    ]) {
      const v = derivePrepareId(id);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0x7fffffff);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
