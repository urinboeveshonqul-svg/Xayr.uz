'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, Loader2, XCircle, UserPlus, Share2, Download, PartyPopper, Compass, Receipt } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatMoney, getProgress } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { providerDisplayName } from '@/lib/payments/providers-meta';
import { ShareModal } from '@/components/campaigns/ShareModal';

type State = 'pending' | 'completed' | 'failed' | 'unknown';

/** Print rules: the receipt card alone, everything else hidden. Mirrors the
 *  approach already used by /admin/finance/report — print-to-PDF with no
 *  extra dependency and no server round-trip. */
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #donation-receipt, #donation-receipt * { visibility: visible !important; }
  #donation-receipt {
    position: absolute; left: 0; top: 0; width: 100%;
    border: none !important; box-shadow: none !important;
  }
  .no-print { display: none !important; }
}`;

interface StatusData {
  amount: number | null;
  title: string | null;
  slug: string | null;
  provider: string | null;
  campaignId: string | null;
  description: string | null;
  image: string | null;
  raised: number | null;
  goal: number | null;
  createdAt: string | null;
}

const EMPTY: StatusData = {
  amount: null, title: null, slug: null, provider: null, campaignId: null,
  description: null, image: null, raised: null, goal: null, createdAt: null,
};

/**
 * Donation success experience.
 *
 * SECURITY: this celebration renders ONLY when the server reports
 * status === 'completed'. Pending, failed, cancelled, expired and unknown
 * references never reach it — the status comes from /api/payments/status,
 * which reads the donation row the Click/Payme callback finalised. Nothing
 * here is derived from client-supplied state, so a donor cannot fake it by
 * editing the URL.
 */
export function PaymentSuccessView({
  reference,
  campaignSlug,
}: {
  reference: string | null;
  campaignSlug: string | null;
}) {
  const { t, ta, locale } = useI18n();
  const [state, setState] = useState<State>(reference ? 'pending' : 'unknown');
  const [d, setD] = useState<StatusData>({ ...EMPTY, slug: campaignSlug });
  const [isGuest, setIsGuest] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Pick the impact message once. Safe against hydration mismatch: the success
  // branch never renders during SSR (state starts 'pending'), so the server and
  // client never disagree on painted DOM.
  const [impactSeed] = useState(() => Math.random());

  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(({ data: { user } }) => { if (active) setIsGuest(!user); });
    return () => { active = false; };
  }, []);

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
          setD((prev) => ({
            amount: typeof j.amount === 'number' ? j.amount : prev.amount,
            title: j.campaignTitle ?? prev.title,
            slug: j.campaignSlug ?? prev.slug,
            provider: j.provider ?? prev.provider,
            campaignId: j.campaignId ?? prev.campaignId,
            description: j.campaignDescription ?? prev.description,
            image: j.campaignImage ?? prev.image,
            raised: typeof j.campaignRaised === 'number' ? j.campaignRaised : prev.raised,
            goal: typeof j.campaignGoal === 'number' ? j.campaignGoal : prev.goal,
            createdAt: j.createdAt ?? prev.createdAt,
          }));
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

  const campaignHref = d.slug ? `/${locale}/campaigns/${d.slug}` : `/${locale}/campaigns`;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${campaignHref}` : '';

  // ── Progress + milestone ────────────────────────────────────────────────
  // `raised` already includes this donation (the apply_donation trigger ran
  // before the status query), so the pre-donation total is raised - amount.
  // A milestone is celebrated only when THIS donation crossed it.
  const hasProgress = d.raised != null && d.goal != null && d.goal > 0;
  const pct = hasProgress ? getProgress(d.raised!, d.goal!) : 0;
  const remaining = hasProgress ? Math.max(0, d.goal! - d.raised!) : 0;

  let milestone: string | null = null;
  if (hasProgress && d.amount != null) {
    const before = Math.max(0, d.raised! - d.amount);
    const pctBefore = getProgress(before, d.goal!);
    if (d.raised! >= d.goal! && before < d.goal!) {
      milestone = t('payment.milestoneGoal');
    } else {
      for (const m of [75, 50, 25]) {
        if (pctBefore < m && pct >= m) { milestone = t('payment.milestonePercent', { n: m }); break; }
      }
    }
  }

  const impacts = ta('payment.impactMessages');
  const impact = impacts.length > 0 ? impacts[Math.floor(impactSeed * impacts.length)] : null;

  const donationDate = d.createdAt ? new Date(d.createdAt) : null;

  // ── Pending ─────────────────────────────────────────────────────────────
  if (state === 'pending') {
    return (
      <div className="card p-10 text-center max-w-md mx-auto" role="status" aria-live="polite">
        <Loader2 className="w-10 h-10 text-brand-600 mx-auto mb-4 animate-spin" />
        <p className="text-gray-600 dark:text-gray-300">{t('payment.confirming')}</p>
      </div>
    );
  }

  // ── Failed / unknown — never the success experience ─────────────────────
  if (state !== 'completed') {
    return (
      <div className="card p-10 text-center max-w-md mx-auto" role="status" aria-live="polite">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('payment.failedTitle')}</h1>
        <Link href={campaignHref} className="btn-primary w-full py-3">{t('payment.backToCampaign')}</Link>
      </div>
    );
  }

  // ── Completed ───────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="max-w-2xl mx-auto space-y-6" role="status" aria-live="polite">
        {/* Gratitude header */}
        <header className="text-center pt-4 pb-2">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mb-6">
            <Heart className="w-10 h-10 text-rose-500 fill-rose-500" aria-hidden />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
            {t('payment.thankYouTitle')}
          </h1>
          <div className="mt-4 space-y-1.5 text-gray-600 dark:text-gray-300 leading-relaxed max-w-lg mx-auto">
            <p>{t('payment.thankYouLine1')}</p>
            <p>{t('payment.thankYouLine2')}</p>
            <p className="font-semibold text-gray-800 dark:text-gray-100">{t('payment.thankYouLine3')}</p>
          </div>
        </header>

        {/* Impact message */}
        {impact && (
          <div className="rounded-2xl bg-brand-50/70 dark:bg-brand-900/15 border border-brand-100 dark:border-brand-900/40 px-6 py-5 text-center">
            <p className="text-brand-800 dark:text-brand-300 font-semibold leading-relaxed">“{impact}”</p>
          </div>
        )}

        {/* Milestone */}
        {milestone && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-6 py-4 flex items-center gap-3">
            <PartyPopper className="w-5 h-5 text-amber-600 flex-shrink-0" aria-hidden />
            <p className="text-sm font-bold text-amber-900 dark:text-amber-300">{milestone}</p>
          </div>
        )}

        {/* Receipt / donation summary */}
        <section id="donation-receipt" className="card p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-5">
            <Receipt className="w-4 h-4 text-gray-400" aria-hidden />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('payment.summaryTitle')}</h2>
          </div>
          <dl className="text-sm space-y-3">
            {d.amount != null && (
              <Row label={t('payment.amount')} value={`${formatMoney(d.amount)} so'm`} strong />
            )}
            {d.title && <Row label={t('payment.campaign')} value={d.title} />}
            {d.provider && providerDisplayName(d.provider) && (
              <Row label={t('payment.provider')} value={providerDisplayName(d.provider)!} />
            )}
            {reference && <Row label={t('payment.reference')} value={reference} mono />}
            {donationDate && (
              <Row
                label={t('payment.date')}
                value={donationDate.toLocaleString(locale, {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              />
            )}
            <Row label={t('payment.status')} value={t('payment.stCompleted')} />
            <Row label={t('payment.receiptStatus')} value={t('payment.receiptReady')} />
          </dl>

          <button
            type="button"
            onClick={() => window.print()}
            className="no-print mt-6 w-full min-h-[48px] rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> {t('payment.downloadReceipt')}
          </button>
        </section>

        {/* Campaign progress */}
        {hasProgress && (
          <section className="card p-6 sm:p-7">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t('payment.progressTitle')}</h2>
            <div className="flex items-end justify-between gap-3 mb-2">
              <div>
                <p className="text-2xl font-black text-brand-600">{formatMoney(d.raised!)} so&apos;m</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('payment.goalLabel')}: {formatMoney(d.goal!)} so&apos;m
                </p>
              </div>
              <span className="text-lg font-black text-gray-900 dark:text-white">{pct}%</span>
            </div>
            <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              {remaining > 0
                ? t('payment.remainingLabel', { amount: `${formatMoney(remaining)} so'm` })
                : t('payment.goalReachedLabel')}
            </p>
          </section>
        )}

        {/* Share — the highest-leverage next action */}
        <section className="card p-6 sm:p-7 text-center no-print">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">{t('payment.shareTitle')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed max-w-md mx-auto">
            {t('payment.shareBody')}
          </p>
          <button
            type="button"
            onClick={() => setShowShare(true)}
            disabled={!d.campaignId}
            className="btn-primary w-full sm:w-auto sm:px-8 py-4 min-h-[56px] mt-5 text-base disabled:opacity-50"
          >
            <Share2 className="w-5 h-5" /> {t('payment.shareBtn')}
          </button>
        </section>

        {/* Next actions */}
        <nav className="grid gap-3 sm:grid-cols-2 no-print" aria-label={t('payment.nextActions')}>
          <Link href={campaignHref} className="min-h-[52px] rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-2">
            <Heart className="w-4 h-4" /> {t('payment.viewCampaign')}
          </Link>
          <Link href={`/${locale}/campaigns`} className="min-h-[52px] rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-2">
            <Compass className="w-4 h-4" /> {t('payment.exploreMore')}
          </Link>
          {/* Only for registered donors — /profile is auth-gated, so this would
              bounce a guest to the login wall. Guests get the account CTA below. */}
          {!isGuest && (
            <Link href={`/${locale}/profile/donations`} className="sm:col-span-2 min-h-[52px] rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-2">
              <Receipt className="w-4 h-4" /> {t('payment.myDonations')}
            </Link>
          )}
        </nav>

        {/* Guest account offer — never forced */}
        {isGuest && (
          <section className="rounded-2xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/60 dark:bg-brand-900/15 p-5 no-print">
            <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand-600" /> {t('payment.ctaTitle')}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{t('payment.ctaText')}</p>
            <Link href={`/${locale}/auth/register`} className="btn-primary w-full py-3 min-h-[48px] mt-4">
              {t('payment.ctaBtn')}
            </Link>
          </section>
        )}
      </div>

      {/* Reuses the campaign share sheet: Telegram first, WhatsApp, Facebook,
          Instagram, Email, QR download + copy link — one implementation. */}
      {showShare && d.campaignId && (
        <ShareModal
          campaignId={d.campaignId}
          title={d.title ?? 'XAYR'}
          description={d.description}
          imageUrl={d.image}
          url={shareUrl}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-400 flex-shrink-0">{label}</dt>
      <dd className={`text-right break-all text-gray-900 dark:text-white ${mono ? 'font-mono text-xs' : ''} ${strong ? 'font-black text-base' : 'font-semibold'}`}>
        {value}
      </dd>
    </div>
  );
}
