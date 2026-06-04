import { createHash, randomInt } from 'crypto';

/** 6-digit numeric OTP. */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/** One-way hash for storage (codes are never stored in plaintext). */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

/**
 * Send the OTP by SMS. Manual / no-provider implementation logs the code.
 * Swap in an Uzbek SMS gateway (Eskiz.uz / Play Mobile) or Twilio here later;
 * nothing else changes.
 */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  console.log(`[OTP] -> ${phone}: ${code}`);
  // TODO: integrate real SMS provider.
}
