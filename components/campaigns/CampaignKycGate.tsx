'use client';

import Link from 'next/link';
import { ShieldCheck, Clock, XCircle, Loader2 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { KycStatus } from '@/lib/kyc';

/**
 * KYC gate shown on the campaign-creation page for users who aren't approved.
 * Status maps: unverified → not started, pending → in review, rejected → retry.
 * "Start"/"Submit Again" route to the existing /verify wizard. Approved users
 * never see this (the page renders the form instead). Server enforcement lives
 * in RLS + the publish trigger (campaign-create-kyc-gate.sql).
 */
export function CampaignKycGate({
  status,
  rejectionReason,
}: {
  status: KycStatus;
  rejectionReason: string | null;
}) {
  const { t, locale } = useI18n();
  const verifyHref = `/${locale}/verify`;

  if (status === 'pending') {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center mb-5">
          <Clock className="w-8 h-8 text-yellow-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('verify.kycPendingTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{t('verify.kycPendingDesc')}</p>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-yellow-700 dark:text-yellow-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('profileVerify.statusPending')}
        </span>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('verify.kycRejectedTitle')}</h2>
        {rejectionReason && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            <span className="font-semibold">{t('verify.kycRejectedReason')}:</span> {rejectionReason}
          </p>
        )}
        <Link href={verifyHref} className="btn-primary px-6 py-3 inline-flex">
          {t('verify.kycSubmitAgain')}
        </Link>
      </div>
    );
  }

  // not started (unverified)
  return (
    <div className="card p-8 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-5">
        <ShieldCheck className="w-8 h-8 text-brand-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('verify.kycNotStartedTitle')}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">{t('verify.kycNotStartedDesc')}</p>
      <Link href={verifyHref} className="btn-primary px-6 py-3 inline-flex">
        {t('verify.kycStartBtn')}
      </Link>
    </div>
  );
}
