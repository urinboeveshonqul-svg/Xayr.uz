import { describe, it, expect } from 'vitest';
import {
  calcPlatformFee,
  calcNetPayout,
  calcAvailableGross,
  payoutBreakdown,
  PLATFORM_FEE_RATE,
  MIN_WITHDRAWAL,
  isValidCard,
  maskCard,
  maskCardDisplay,
} from '@/lib/payout';
import { formatMoney, formatAmount } from '@/lib/utils';

describe('dynamic commission — the creator enters GROSS; commission = round(gross*0.04)', () => {
  // The amount the creator enters IS the gross. These are the canonical examples.
  it.each([
    [5000, 200, 4800],
    [5208, 208, 5000],
    [10000, 400, 9600],
    [275350, 11014, 264336],
  ])('gross %i -> commission %i -> net %i', (gross, fee, net) => {
    expect(calcPlatformFee(gross)).toBe(fee);
    expect(calcNetPayout(gross)).toBe(net);
    expect(fee + net).toBe(gross);
    // a stored row with these values reads back identically through the helper
    const bd = payoutBreakdown({ amount: gross, commission_amount: fee, payout_amount: net });
    expect([bd.gross, bd.fee, bd.net]).toEqual([gross, fee, net]);
  });
});

describe('payoutBreakdown — single source of truth for a STORED request (gross/fee/net)', () => {
  it('reads stored values; fee + net always reconciles to gross', () => {
    for (const [gross, fee] of [[100000, 4000], [10000, 400], [999999, 40000], [5208, 208]] as const) {
      const bd = payoutBreakdown({ amount: gross, commission_amount: fee, payout_amount: gross - fee });
      expect(bd.gross).toBe(gross);
      expect(bd.fee).toBe(fee);
      expect(bd.net).toBe(gross - fee);
      expect(bd.fee + bd.net).toBe(bd.gross); // the DB CHECK, mirrored
    }
  });

  it('0% legacy rows (pre-fee): net === gross, fee 0, rate 0%', () => {
    const bd = payoutBreakdown({ amount: 50000, commission_amount: 0, payout_amount: 50000 });
    expect(bd).toMatchObject({ gross: 50000, fee: 0, net: 50000, ratePercent: 0 });
  });

  it('3% historical rows keep their stored rate — never re-derived to 4%', () => {
    // A #26..#50 row charged 3%: 100000 -> 3000 fee, 97000 net.
    const bd = payoutBreakdown({ amount: 100000, commission_amount: 3000, payout_amount: 97000 });
    expect(bd.fee).toBe(3000);       // NOT round(100000*0.04)=4000
    expect(bd.net).toBe(97000);
    expect(bd.ratePercent).toBe(3);
  });

  it('4% current rows: 10,000 gross -> 400 fee -> 9,600 net (the admin-transfer amount)', () => {
    const bd = payoutBreakdown({ amount: 10000, commission_amount: 400, payout_amount: 9600 });
    expect(bd.net).toBe(9600);       // what the admin must transfer
    expect(bd.ratePercent).toBe(4);
    // matches the forward calc used for a NEW request preview:
    expect(bd.fee).toBe(calcPlatformFee(10000));
    expect(bd.net).toBe(calcNetPayout(10000));
  });

  it('falls back to gross-minus-fee when payout_amount is missing (defensive)', () => {
    expect(payoutBreakdown({ amount: 10000, commission_amount: 400 }).net).toBe(9600);
    expect(payoutBreakdown({ amount: 10000 }).net).toBe(10000); // no fee recorded
  });

  it('admin transfer amount never shows the gross for a 4% request (formatted, exact)', () => {
    const bd = payoutBreakdown({ amount: 10000, commission_amount: 400, payout_amount: 9600 });
    expect(formatAmount(bd.net)).not.toBe(formatAmount(bd.gross)); // 9 600 != 10 000
    expect(formatAmount(bd.net).replace(/\D/g, '')).toBe('9600');
  });
});

describe('money formatting on withdrawal/financial surfaces (regression: rounding masked amounts)', () => {
  it('formatMoney ABBREVIATES + rounds — 9,600 becomes "10 ming", indistinguishable from 10,000', () => {
    expect(formatMoney(9600)).toBe('10 ming');
    expect(formatMoney(10000)).toBe('10 ming');
  });

  it('formatAmount is EXACT, so two different amounts never render the same', () => {
    expect(formatAmount(9600).replace(/\D/g, '')).toBe('9600');
    expect(formatAmount(9600)).not.toBe(formatAmount(10000));
  });

  it('the gross available formats exactly at 10k / 100k / 1M', () => {
    for (const balance of [10000, 100000, 1000000] as const) {
      const gross = calcAvailableGross(balance, []);
      expect(gross).toBe(balance);
      expect(formatAmount(gross).replace(/\D/g, '')).toBe(String(balance));
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
  it('is 5,000 so\'m GROSS — the minimum the creator can enter (migration #60)', () => {
    expect(MIN_WITHDRAWAL).toBe(5000);
  });
});

describe('available balance = the GROSS the creator can request (mirrors campaign_available_balance)', () => {
  const req = (status: string, amount: number) => ({ status, amount });

  it('no donations → nothing available', () => {
    expect(calcAvailableGross(0, [])).toBe(0);
  });

  it('10,000 balance → available 10,000 (gross); entering it pays net 9,600', () => {
    const available = calcAvailableGross(10000, []);
    expect(available).toBe(10000);
    expect(calcNetPayout(available)).toBe(9600); // what the admin transfers
  });

  it('multiple donations accumulate', () => {
    expect(calcAvailableGross(7000 + 3000, [])).toBe(10000);
  });

  it('pending / approved / info_requested withdrawals reserve their GROSS', () => {
    expect(calcAvailableGross(10000, [req('pending_review', 4000)])).toBe(6000);
    expect(calcAvailableGross(10000, [req('approved', 4000)])).toBe(6000);
    expect(calcAvailableGross(10000, [req('info_requested', 4000)])).toBe(6000);
  });

  it('paid withdrawals stay deducted; multiple withdrawals stack (all gross)', () => {
    // 100,000 raised; 30,000 paid + 20,000 pending committed → 50,000 gross left
    expect(calcAvailableGross(100000, [req('paid', 30000), req('pending_review', 20000)])).toBe(50000);
  });

  it('rejected and cancelled requests release their funds', () => {
    expect(calcAvailableGross(10000, [req('rejected', 5000), req('cancelled', 2000)])).toBe(10000);
  });

  it('a refund reduces the donation total (apply_donation reverses current_amount)', () => {
    // 100,000 raised then 40,000 refunded → current_amount 60,000
    expect(calcAvailableGross(60000, [])).toBe(60000);
  });

  it('never goes negative (over-committed edge, e.g. post-request refund)', () => {
    expect(calcAvailableGross(1000, [req('paid', 5000)])).toBe(0);
  });

  it('entering the full available gross drains the balance to exactly zero', () => {
    const available = calcAvailableGross(10000, []);
    expect(calcAvailableGross(10000, [req('pending_review', available)])).toBe(0);
  });

  it('the max the creator can enter is the gross available; net = gross − 4%', () => {
    for (const balance of [10000, 100000, 1000000, 12345, 5000, 987654]) {
      const available = calcAvailableGross(balance, []);
      expect(available).toBe(balance);
      expect(calcNetPayout(available)).toBe(balance - calcPlatformFee(balance));
    }
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
