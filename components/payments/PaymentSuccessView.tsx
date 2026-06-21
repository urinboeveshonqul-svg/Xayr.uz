'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney } from '@/lib/utils';

type State = 'pending' | 'completed' | 'failed' | 'unknown';

/**
 * Payment-success screen. Polls /api/payments/status by reference until the
 * donation is completed or failed (so a pending gateway redirect resolves
 * automatically). Shows amount, campaign, reference, and status. Read-only.
 */
export function PaymentSuccessView({
  reference,
  campaignSlug,
}: {
  reference: string | null;
  campaignSlug: string | null;
}) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<State>(reference ? 'pending' : 'unknown');
  const [amount, setAmount] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(campaignSlug);

  useEffect(() => {
    if (!reference) return;
    let active = true;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(reference)}`);
        if (res.ok) {
          const j = await res.json();
          if (!active) return;
          if (typeof j.amount === 'number') setAmount(j.amount);
          if (j.campaignTitle) setTitle(j.campaignTitle);
          if (j.campaignSlug) setSlug(j.campaignSlug);
          if (j.status === 'completed') { setState('completed'); return; }
          if (j.status === 'failed') { setState('failed'); return; }
        }
      } catch {
        /* transient — keep polling */
      }
      if (active && tries < 20) setTimeout(poll, 3000);
    };
    poll();
    return () => { active = false; };
  }, [reference]);

  const campaignHref = slug ? `/${locale}/campaigns/${slug}` : `/${locale}/campaigns`;

  return (
    <div className="card p-8 text-center max-w-md mx-auto" role="status" aria-live="polite">
      {state === 'pending' && (
        <>
          <Loader2 className="w-12 h-12 text-brand-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600 dark:text-gray-300">{t('payment.confirming')}</p>
        </>
      )}

      {state === 'completed' && (
        <>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-5">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-4">{t('payment.successTitle')}</h1>
          <dl className="text-sm text-left space-y-2 mb-6">
            {amount != null && (
              <Row label={t('payment.amount')} value={`${formatMoney(amount)} so'm`} />
            )}
            {title && <Row label={t('payment.campaign')} value={title} />}
            {reference && <Row label={t('payment.reference')} value={reference} mono />}
            <Row label={t('payment.status')} value={t('payment.stCompleted')} />
          </dl>
          <Link href={campaignHref} className="btn-primary w-full py-3">{t('payment.backToCampaign')}</Link>
        </>
      )}

      {(state === 'failed' || state === 'unknown') && (
        <>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('payment.failedTitle')}</h1>
          <Link href={campaignHref} className="btn-primary w-full py-3">{t('payment.backToCampaign')}</Link>
        </>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className={`font-semibold text-gray-900 dark:text-white text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
