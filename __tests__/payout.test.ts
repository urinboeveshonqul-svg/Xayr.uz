import { describe, it, expect } from 'vitest';
import {
  calcPlatformFee,
  calcNetPayout,
  grossForNet,
  calcAvailableGross,
  calcAvailableNet,
  netAvailableFromGross,
  PLATFORM_FEE_RATE,
  MIN_WITHDRAWAL,
  MIN_WITHDRAWAL_NET,
  isValidCard,
  maskCard,
  maskCardDisplay,
} from '@/lib/payout';
import { formatMoney, formatAmount } from '@/lib/utils';

describe('money formatting on withdrawal/financial surfaces (regression: net looked like gross)', () => {
  it('formatMoney ABBREVIATES + rounds — 9,600 becomes "10 ming", indistinguishable from gross', () => {
    // This is exactly why "Available to withdraw" looked like 10,000: the value
    // was the correct net 9,600 but formatMoney rounded it up for display.
    expect(formatMoney(9600)).toBe('10 ming');
    expect(formatMoney(10000)).toBe('10 ming');
  });

  it('formatAmount is EXACT, so a net figure can never masquerade as the gross', () => {
    expect(formatAmount(9600).replace(/\D/g, '')).toBe('9600');
    expect(formatAmount(9600)).not.toBe(formatAmount(10000));
  });

  it('the amount shown as "Available to withdraw" (net) formats exactly at 10k/100k/1M', () => {
    for (const [donations, expectedNet] of [[10000, 9600], [100000, 96000], [1000000, 960000]] as const) {
      const net = calcAvailableNet(donations, []);
      expect(net).toBe(expectedNet);
      expect(formatAmount(net).replace(/\D/g, '')).toBe(String(expectedNet));
    }
  });
});

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
  it('is 5,000 so\'m (lowered from 50,000 by migration #60)', () => {
    expect(MIN_WITHDRAWAL).toBe(5000);
  });

  it('the NET minimum shown to the creator is the documented round 5,000', () => {
    expect(MIN_WITHDRAWAL_NET).toBe(5000);
  });

  it('every client-accepted net satisfies the server gross guard (below_minimum unreachable)', () => {
    // The smallest amount the client allows converts to a gross that clears
    // the server's ≥5,000 guard with room to spare; larger nets only more so.
    expect(grossForNet(MIN_WITHDRAWAL_NET)).toBeGreaterThanOrEqual(MIN_WITHDRAWAL);
    expect(grossForNet(MIN_WITHDRAWAL_NET)).toBe(5208); // 5208 − round(5208·4%) = 5000
    // The client minimum is stricter than (or equal to) the net of the server
    // minimum, so the two gates can never disagree.
    expect(MIN_WITHDRAWAL_NET).toBeGreaterThanOrEqual(calcNetPayout(MIN_WITHDRAWAL));
  });
});

describe('net-request conversion (grossForNet inverts the server formula exactly)', () => {
  it('the user-facing example: 10,000 gross → 9,600 available; entering 9,600 pays 9,600', () => {
    expect(calcNetPayout(10000)).toBe(9600);
    expect(grossForNet(9600)).toBe(10000);
  });

  it('round-trips EVERY net value: the amount typed is the amount the server pays', () => {
    for (let net = 1; net <= 25000; net++) {
      const gross = grossForNet(net);
      expect(calcNetPayout(gross)).toBe(net); // server: payout = gross − round(gross·4%)
      expect(calcNetPayout(gross - 1)).toBe(net - 1); // smallest such gross → lowest fee
    }
  });

  it('never requests more gross than is available (Max button is always accepted)', () => {
    for (const available of [5000, 10000, 10001, 10012, 10013, 123457, 999_999]) {
      const net = calcNetPayout(available);
      expect(grossForNet(net)).toBeLessThanOrEqual(available);
    }
  });

  it('handles zero and negative safely', () => {
    expect(grossForNet(0)).toBe(0);
    expect(grossForNet(-500)).toBe(0);
  });
});

describe('available balance (mirrors campaign_available_balance: committed = active + paid)', () => {
  const req = (status: string, amount: number) => ({ status, amount });

  it('no donations → nothing available', () => {
    expect(calcAvailableGross(0, [])).toBe(0);
  });

  it('one donation → full gross available; net shown = gross − 4%', () => {
    expect(calcAvailableGross(10000, [])).toBe(10000);
    expect(calcNetPayout(calcAvailableGross(10000, []))).toBe(9600);
  });

  it('multiple donations accumulate', () => {
    expect(calcAvailableGross(7000 + 3000, [])).toBe(10000);
  });

  it('pending / approved / info_requested withdrawals reserve their gross', () => {
    expect(calcAvailableGross(10000, [req('pending_review', 4000)])).toBe(6000);
    expect(calcAvailableGross(10000, [req('approved', 4000)])).toBe(6000);
    expect(calcAvailableGross(10000, [req('info_requested', 4000)])).toBe(6000);
  });

  it('paid withdrawals stay deducted; multiple withdrawals stack', () => {
    expect(calcAvailableGross(10000, [req('paid', 5000), req('pending_review', 2000)])).toBe(3000);
  });

  it('rejected and cancelled requests release their funds', () => {
    expect(calcAvailableGross(10000, [req('rejected', 5000), req('cancelled', 2000)])).toBe(10000);
  });

  it('a refund reduces the donation total (apply_donation reverses current_amount)', () => {
    // 10,000 raised, 3,000 refunded → current_amount = 7,000
    expect(calcAvailableGross(7000, [])).toBe(7000);
  });

  it('never goes negative (over-committed edge, e.g. post-request refund)', () => {
    expect(calcAvailableGross(1000, [req('paid', 5000)])).toBe(0);
  });

  it('full-balance withdrawal drains to exactly zero (the "Max" flow)', () => {
    const available = calcAvailableGross(10000, []);
    const net = calcNetPayout(available); // creator sees & enters 9,600
    // The client sends the full gross for the Max case:
    expect(calcAvailableGross(10000, [req('pending_review', available)])).toBe(0);
    expect(net).toBe(9600);
  });
});

describe('Available to withdraw is ALWAYS the net (calcAvailableNet — the single display source)', () => {
  const req = (status: string, amount: number) => ({ status, amount });

  // The exact scenarios from the task. "Available to withdraw" must equal what
  // the creator actually receives — never the gross balance.
  it('10,000 gross balance → shows 9,600 (never 10,000)', () => {
    expect(calcAvailableNet(10000, [])).toBe(9600);
    expect(calcAvailableNet(10000, [])).not.toBe(10000);
  });

  it('100,000 gross balance → shows 96,000', () => {
    expect(calcAvailableNet(100000, [])).toBe(96000);
  });

  it('1,000,000 gross balance → shows 960,000', () => {
    expect(calcAvailableNet(1000000, [])).toBe(960000);
  });

  it('the displayed available always equals the payout of withdrawing it all', () => {
    for (const balance of [10000, 100000, 1000000, 12345, 5000, 987654]) {
      const shown = calcAvailableNet(balance, []);
      const gross = grossForNet(shown); // what the client sends on "Max"
      expect(calcNetPayout(gross)).toBe(shown); // server pays exactly the shown amount
      expect(gross).toBeLessThanOrEqual(balance); // never over-withdraws
    }
  });

  it('multiple withdrawals: available nets the remaining gross', () => {
    // 100,000 raised; 30,000 paid + 20,000 pending committed → 50,000 gross left
    const reqs = [req('paid', 30000), req('pending_review', 20000)];
    expect(calcAvailableGross(100000, reqs)).toBe(50000);
    expect(calcAvailableNet(100000, reqs)).toBe(48000); // 50,000 − 4%
  });

  it('a pending withdrawal reserves its gross, and the net reflects it', () => {
    expect(calcAvailableNet(100000, [req('pending_review', 100000)])).toBe(0);
  });

  it('a refund lowers current_amount, so the net available drops with it', () => {
    // 100,000 raised then 40,000 refunded → current_amount 60,000
    expect(calcAvailableNet(60000, [])).toBe(57600); // 60,000 − 4%
  });

  it('admin platform aggregate uses the same fee rule', () => {
    expect(netAvailableFromGross(1000000)).toBe(960000);
    expect(netAvailableFromGross(0)).toBe(0);
    expect(netAvailableFromGross(-5)).toBe(0);
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
