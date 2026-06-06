'use client';

import Link from 'next/link';
import { ShieldCheck, Clock, XCircle, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { VerificationStatus } from '@/types';

const STYLES: Record<
  VerificationStatus,
  { badge: string; iconWrap: string; icon: typeof ShieldCheck }
> = {
  unverified: { badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', iconWrap: 'bg-gray-100 text-gray-500 dark:bg-gray-800', icon: ShieldAlert },
  pending:    { badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', iconWrap: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20', icon: Clock },
  verified:   { badge: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', iconWrap: 'bg-green-50 text-green-600 dark:bg-green-900/20', icon: ShieldCheck },
  rejected:   { badge: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', iconWrap: 'bg-red-50 text-red-600 dark:bg-red-900/20', icon: XCircle },
};

/**
 * Verification status summary shown at the top of the profile page.
 * Uses the existing design-system primitives (card / btn-primary) — no redesign.
 */
export function VerificationStatusCard({
  status,
  verifiedAt,
  rejectionReason,
}: {
  status: VerificationStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
}) {
  const { t, locale } = useI18n();
  const s = STYLES[status] ?? STYLES.unverified;
  const Icon = s.icon;

  const statusLabel =
    {
      unverified: t('profileVerify.statusUnverified'),
      pending: t('profileVerify.statusPending'),
      verified: t('profileVerify.statusVerified'),
      rejected: t('profileVerify.statusRejected'),
    }[status] ?? t('profileVerify.statusUnverified');

  let formattedVerifiedAt: string | null = null;
  if (verifiedAt) {
    try {
      formattedVerifiedAt = new Date(verifiedAt).toLocaleDateString(locale);
    } catch {
      formattedVerifiedAt = verifiedAt;
    }
  }

  return (
    <div className="card p-6 mb-4">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${s.iconWrap}`}>
          <Icon className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="font-bold text-gray-900 dark:text-white">{t('profileVerify.cardTitle')}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${s.badge}`}>{statusLabel}</span>
            {status === 'verified' && <ShieldCheck className="w-4 h-4 text-green-600" aria-hidden />}
          </div>

          {status === 'pending' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('profileVerify.pendingMsg')}</p>
          )}

          {status === 'verified' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('profileVerify.verifiedMsg')}
              {formattedVerifiedAt && (
                <span className="block mt-0.5 text-xs text-gray-400">
                  {t('profileVerify.verifiedAtLabel')}: {formattedVerifiedAt}
                </span>
              )}
            </p>
          )}

          {status === 'rejected' && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('profileVerify.rejectedMsg')}</p>
              {rejectionReason && (
                <p className="text-sm mt-2 text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">{t('profileVerify.reasonLabel')}:</span> {rejectionReason}
                </p>
              )}
              <Link href={`/${locale}/verify`} className="btn-primary mt-4 inline-flex">
                {t('profileVerify.resubmitBtn')}
              </Link>
            </>
          )}

          {status === 'unverified' && (
            <Link href={`/${locale}/verify`} className="btn-primary mt-3 inline-flex">
              {t('profileVerify.startBtn')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
