import type { VerificationStatus } from '@/types';

/**
 * KYC (identity verification) status — the vocabulary used across the UI.
 * The database column `users.verification_status` predates the KYC rename and
 * still uses email-era literals; `toKycStatus` maps it to the KYC concepts so
 * components compare only against valid KYC members (no impossible comparisons,
 * no "verified"/"unverified" email-flavored strings in the UI layer).
 */
export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export function toKycStatus(status: VerificationStatus | null | undefined): KycStatus {
  switch (status) {
    case 'verified':
      return 'approved';
    case 'pending':
      return 'pending';
    case 'rejected':
      return 'rejected';
    default:
      return 'not_started'; // 'unverified' or missing
  }
}
