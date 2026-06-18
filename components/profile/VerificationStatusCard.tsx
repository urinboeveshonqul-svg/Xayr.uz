'use client';

import Link from 'next/link';
import { ShieldCheck, Clock, XCircle, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { KycStatus } from '@/lib/kyc';

/**
 * Profile KYC status section. Shown only while identity verification is
 * incomplete — once `approved` it renders nothing (clean profile). Pure KYC
 * vocabulary: not_started / pending / rejected (approved is the hidden case).
 */
type VisibleStatus = Exclude<KycStatus, 'approved'>;

const STYLES: Record<VisibleStatus, { badge: string; iconWrap: string; icon: typeof ShieldCheck }> = {
  not_started: { badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', iconWrap: 'bg-gray-100 text-gray-500 dark:bg-gray-800', icon: ShieldAlert },
  pending:     { badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', iconWrap: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20', icon: Clock },
  rejected:    { badge: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', iconWrap: 'bg-red-50 text-red-600 dark:bg-red-900/20', icon: XCircle },
};

export function VerificationStatusCard({
  status,
  rejectionReason,
}: {
  status: KycStatus;
  rejectionReason: string | null;
}) {
  const { t, locale } = useI18n();

  // Approved → no card at all.
  if (status === 'approved') return null;

  const s = STYLES[status];
  const Icon = s.icon;

  const statusLabel: Record<VisibleStatus, string> = {
    not_started: t('profileVerify.statusUnverified'),
    pending: t('profileVerify.statusPending'),
    rejected: t('profileVerify.statusRejected'),
  };

  return (
    <div className="card p-6 mb-4">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${s.iconWrap}`}>
          <Icon className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="font-bold text-gray-900 dark:text-white">{t('profileVerify.cardTitle')}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${s.badge}`}>{statusLabel[status]}</span>
          </div>

          {status === 'pending' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('profileVerify.pendingMsg')}</p>
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

          {status === 'not_started' && (
            <Link href={`/${locale}/verify`} className="btn-primary mt-3 inline-flex">
              {t('profileVerify.startBtn')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
