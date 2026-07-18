'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Wallet, Plus, X, Loader2, Clock, Send, CreditCard, Info, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PayoutAccountForm, type PayoutAccountInitial } from '@/components/profile/PayoutAccountForm';
import { formatMoney, timeAgo } from '@/lib/utils';
import {
  MIN_WITHDRAWAL,
  PLATFORM_FEE_PERCENT,
  calcPlatformFee,
  calcNetPayout,
  maskFromLast4,
  cardTypeLabel,
} from '@/lib/payout';
import type { PostgrestError } from '@supabase/supabase-js';
import type { PayoutRequest, PayoutRequestEvent } from '@/types';

export interface CampaignPayoutRow extends PayoutRequest {
  events: PayoutRequestEvent[];
}

/**
 * Masked, client-safe projection of the saved payout account. Built server-side
 * (see the analytics page) so the full card number is NEVER serialized to the
 * creator's browser — only the BIN+last4 mask is.
 */
export interface PayoutInfoDisplay {
  fullLegalName: string;
  phone: string;
  cardType: string;
  cardMasked: string;
  cardholderName: string;
  bankName: string | null;
}

const ACTIVE = ['pending_review', 'approved', 'info_requested'];

const STATUS_CLS: Record<string, string> = {
  pending_review: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  approved:       'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  info_requested: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  rejected:       'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  paid:           'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  cancelled:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

const ACTION: Record<string, string> = {
  created:        "So'rov yaratildi",
  approved:       'Tasdiqlandi',
  rejected:       'Rad etildi',
  info_requested: "Ma'lumot so'raldi",
  paid:           "To'landi",
  cancelled:      'Bekor qilindi',
};

// RPC error code → translation key. Resolved through t() at call time so the
// message follows the active language (was a hardcoded Uzbek map).
const ERR_KEYS: Record<string, string> = {
  auth_required:            'toasts.payoutErrAuthRequired',
  not_campaign_owner:       'toasts.payoutErrNotOwner',
  campaign_not_approved:    'toasts.payoutErrNotApproved',
  owner_not_verified:       'toasts.payoutErrNotVerified',
  payout_info_required:     'toasts.payoutErrInfoRequired',
  invalid_amount:           'toasts.payoutErrInvalidAmount',
  invalid_method:           'toasts.payoutErrInvalidMethod',
  active_request_exists:    'toasts.payoutErrActiveExists',
  amount_exceeds_available: 'toasts.payoutErrExceedsAvailable',
};

export function CampaignPayouts({
  campaignId,
  campaignStatus,
  userId,
  available,
  raised,
  totalWithdrawn,
  isVerified,
  hasPayoutInfo,
  payoutSummary,
  payoutInfo,
  requests,
  locale,
}: {
  campaignId: string;
  campaignStatus: string;
  userId: string;
  available: number;
  raised: number;
  totalWithdrawn: number;
  isVerified: boolean;
  hasPayoutInfo: boolean;
  payoutSummary: string | null;
  payoutInfo: PayoutInfoDisplay | null;
  requests: CampaignPayoutRow[];
  locale: string;
}) {
  const router = useRouter();
  const { t } = useI18n();

  // Resolve an RPC error code to a localized message. below_minimum carries the
  // configurable minimum; anything unmapped falls back to a generic message
  // rather than surfacing a raw backend string.
  const errMsg = (code: string): string => {
    if (code === 'below_minimum') return t('toasts.payoutErrBelowMinimum', { min: formatMoney(MIN_WITHDRAWAL) });
    const key = ERR_KEYS[code];
    return key ? t(key) : t('toasts.generic');
  };
  const psLabel: Record<string, string> = {
    pending_review: t('dash.psPending'),
    approved: t('dash.psApproved'),
    info_requested: t('dash.psInfo'),
    rejected: t('dash.psRejected'),
    paid: t('dash.psPaid'),
    cancelled: t('dash.psCancelled'),
  };
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Inline payout-info editor state. The full account is fetched on demand
  // (RLS-scoped to the owner) so the unmasked card number is never in the
  // initial page payload — only pulled when the owner actually edits.
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutInitial, setPayoutInitial] = useState<PayoutAccountInitial | null>(null);
  const [loadingPayout, setLoadingPayout] = useState(false);

  const hasActive = requests.some((r) => ACTIVE.includes(r.status));
  const approved = campaignStatus === 'active' || campaignStatus === 'completed' || campaignStatus === 'funded';
  const canRequest = isVerified && hasPayoutInfo && approved && available > 0 && !hasActive;
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  // Show the processing-info card only when the user can actually act on
  // withdrawals: eligible to request (verified + approved campaign + funds, even
  // if payout info is still pending) or has past/active requests to view.
  const eligibleForWithdrawals =
    (isVerified && approved && available > 0) || requests.length > 0;

  // Body text carries a {days} placeholder so the day-range can be emphasised.
  const [infoBefore, infoAfter = ''] = t('dash.withdrawInfoText').split('{days}');

  // Payout-info setup: when the user is otherwise ready to withdraw but hasn't
  // saved payout details, show the form inline FIRST (in place of the withdraw
  // action). Same eligibility gate that previously drove the CTA.
  const showSetupForm = !hasPayoutInfo && isVerified && approved && available > 0 && !hasActive;
  // The inline payout form is open for first-time setup or an explicit edit.
  const showPayoutForm = showSetupForm || (hasPayoutInfo && editingPayout);

  // Open the editor for an EXISTING account. PHASE 2: the card number is
  // encrypted and is NEVER sent to the browser — we fetch only the non-sensitive
  // fields plus the stored last-4 (for the masked placeholder). Leaving the card
  // field blank on save keeps the existing encrypted card unchanged.
  const startEditPayout = async () => {
    setEditingPayout(true);
    setLoadingPayout(true);
    try {
      const { data } = await createClient()
        .from('payout_accounts')
        .select('full_legal_name, phone_number, card_type, cardholder_name, bank_name, secret_last4')
        .eq('user_id', userId)
        .maybeSingle();
      setPayoutInitial((data as PayoutAccountInitial | null) ?? null);
    } catch {
      setPayoutInitial(null);
    } finally {
      setLoadingPayout(false);
    }
  };
  const closeEditPayout = () => {
    setEditingPayout(false);
    setPayoutInitial(null);
  };

  const blockedReason = !approved
    ? 'Kampaniya tasdiqlangandan keyin mablag’ yechib olish mumkin'
    : !isVerified
    ? 'Yechish uchun hisobingizni tasdiqlang'
    : !hasPayoutInfo
    ? null // handled by the inline payout setup form above
    : hasActive
    ? "Sizda faol so'rov mavjud — natijani kuting"
    : available <= 0
    ? "Yechish uchun mavjud mablag' yo'q"
    : null;

  const resetForm = () => {
    setAmount('');
    setNotes('');
    setAgree(false);
    setShowForm(false);
  };

  // Display-only preview; the authoritative fee is computed in the DB function.
  const previewAmt = Math.floor(Number(amount)) || 0;
  const previewFee = calcPlatformFee(previewAmt);
  const previewNet = calcNetPayout(previewAmt);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.floor(Number(amount));
    if (!amt || amt <= 0) { toast.error(t('toasts.withdrawInvalidAmount')); return; }
    if (amt < MIN_WITHDRAWAL) { toast.error(errMsg('below_minimum')); return; }
    if (amt > available) { toast.error(t('toasts.withdrawInsufficient')); return; }
    if (!agree) { toast.error(t('toasts.withdrawAgreeFee')); return; }

    setSubmitting(true);
    try {
      // Payout details (card etc.) are taken from the saved payout account and
      // snapshotted server-side — the client never sends them here.
      const { error }: { error: PostgrestError | null } = await createClient().rpc('create_payout_request', {
        p_campaign_id: campaignId,
        p_amount: amt,
        p_notes: notes.trim(),
      });
      if (error) { toast.error(errMsg(error.message)); return; }
      toast.success(t('toasts.withdrawRequested'));
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8">
      <div className="card p-6">
        {/* Funds summary: Total Raised · Total Withdrawn · Available Balance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
            <p className="text-xs text-gray-400">{t('dash.totalRaised')}</p>
            <p className="text-xl font-black text-gray-900 dark:text-white break-words leading-tight">{formatMoney(raised)} so&apos;m</p>
          </div>
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-4">
            <p className="text-xs text-gray-400">{t('dash.totalWithdrawn')}</p>
            <p className="text-xl font-black text-gray-900 dark:text-white break-words leading-tight">{formatMoney(totalWithdrawn)} so&apos;m</p>
          </div>
          <div className="rounded-2xl bg-brand-50 dark:bg-brand-900/20 p-4">
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-brand-600" />
              <p className="text-xs text-brand-700/80 dark:text-brand-400/90">{t('dash.availableBalance')}</p>
            </div>
            <p className="text-xl font-black text-brand-700 dark:text-brand-400 break-words leading-tight">{formatMoney(available)} so&apos;m</p>
          </div>
        </div>

        {/* Payout information lives directly in the withdrawal flow:
            • no account yet (and ready to withdraw) → show the form inline first;
            • account exists → read-only masked card with an inline Edit;
            • editing → the same form, prefilled from the on-demand fetch.
            The server snapshots the account at request time, so card details
            are never re-entered when withdrawing. */}
        {showPayoutForm ? (
          <div className="mt-5">
            {loadingPayout ? (
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-8 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
              </div>
            ) : (
              <PayoutAccountForm
                userId={userId}
                initial={editingPayout ? payoutInitial : null}
                embedded
                onSaved={closeEditPayout}
                onCancel={editingPayout ? closeEditPayout : undefined}
              />
            )}
          </div>
        ) : payoutInfo ? (
          <div className="mt-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-4 h-4 text-brand-600" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{t('dash.payoutInfoTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={startEditPayout}
                className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1 flex-shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" /> {t('dash.payoutEdit')}
              </button>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div className="min-w-0">
                <dt className="text-xs text-gray-400">{t('dash.payoutLegalName')}</dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-white break-words">{payoutInfo.fullLegalName}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-gray-400">{t('dash.payoutPhone')}</dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-white break-words">{payoutInfo.phone}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-gray-400">{t('dash.payoutCardType')}</dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-white">{cardTypeLabel(payoutInfo.cardType)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-gray-400">{t('dash.payoutCardNumber')}</dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-white break-words tracking-wider tabular-nums">{payoutInfo.cardMasked}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-gray-400">{t('dash.payoutCardholder')}</dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-white break-words">{payoutInfo.cardholderName}</dd>
              </div>
              {payoutInfo.bankName && (
                <div className="min-w-0">
                  <dt className="text-xs text-gray-400">{t('dash.payoutBank')}</dt>
                  <dd className="text-sm font-semibold text-gray-900 dark:text-white break-words">{payoutInfo.bankName}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : null}

        {/* Request action — hidden while the payout form is open. The withdrawal
            form is only enabled once payout info exists (canRequest). */}
        {!showPayoutForm && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            {canRequest ? (
              <button onClick={() => setShowForm(true)} className="btn-primary px-5 py-2.5">
                <Plus className="w-4 h-4" /> {t('dash.withdrawBtn')}
              </button>
            ) : (
              blockedReason && <p className="text-sm text-gray-400 sm:max-w-xs sm:text-right">{blockedReason}</p>
            )}
          </div>
        )}

        {/* Requests list */}
        {requests.length > 0 && (
          <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-5 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{t('dash.requestHistory')}</p>
            {requests.map((r) => {
              const stCls = STATUS_CLS[r.status] ?? STATUS_CLS.pending_review;
              const stLabel = psLabel[r.status] ?? psLabel.pending_review;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="w-full text-left rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatMoney(r.amount)} so&apos;m</p>
                    <p className="text-[11px] text-gray-400">{timeAgo(r.created_at)}</p>
                  </div>
                  <span className={`badge ${stCls}`}>{stLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Withdrawal processing info — shown only to users eligible to request/view withdrawals */}
      {eligibleForWithdrawals && (
        <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
              <Info className="w-4 h-4 text-brand-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('dash.withdrawInfoTitle')}</h3>
              <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {infoBefore}
                <strong className="font-semibold text-gray-700 dark:text-gray-300">{t('dash.withdrawInfoDays')}</strong>
                {infoAfter}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Request form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}
        >
          <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 my-8 space-y-4 animate-pop">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Mablag&apos;ni yechish</h3>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600" aria-label="Yopish">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Saved payout destination — read-only confirmation (edit it from the
                payout card on the withdrawal page, not from here). */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-sm">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-semibold">
                <CreditCard className="w-4 h-4 text-brand-600" />
                <span className="break-words">{payoutSummary ?? '—'}</span>
              </div>
            </div>

            <div>
              <label className="label">
                Miqdor (min {formatMoney(MIN_WITHDRAWAL)} · max {formatMoney(available)} so&apos;m)
              </label>
              <input
                type="number"
                min={MIN_WITHDRAWAL}
                max={available}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">Izoh (ixtiyoriy)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input resize-none"
                placeholder="Qo'shimcha ma'lumot..."
              />
            </div>

            {/* Fee breakdown — display preview; the DB computes the authoritative fee */}
            {previewAmt > 0 && (
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('dash.withdrawAmount')}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatMoney(previewAmt)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('dash.feeRow')}</span>
                  <span className="font-bold text-red-600">−{formatMoney(previewFee)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <span className="font-bold text-gray-900 dark:text-white">{t('dash.youReceive')}</span>
                  <span className="font-black text-brand-600">{formatMoney(previewNet)} so&apos;m</span>
                </div>
              </div>
            )}

            {/* Fee notice — shown before confirming, independent of the amount
                preview so it is visible even before an amount is entered. */}
            <p
              role="note"
              className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-3.5 py-2.5 text-xs font-semibold text-amber-900 dark:text-amber-200"
            >
              {t('dash.feeNotice')}
            </p>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="w-4 h-4 accent-brand-600 mt-0.5"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                {t('dash.feeConsent')}
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="btn-ghost px-4 py-2 text-sm">Bekor qilish</button>
              <button type="submit" disabled={submitting} className="btn-primary px-5 py-2 text-sm">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Yuborilmoqda...</> : <><Send className="w-4 h-4" /> Yuborish</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Request details modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 my-8 space-y-5 animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`badge ${STATUS_CLS[selected.status] ?? STATUS_CLS.pending_review}`}>
                  {psLabel[selected.status] ?? psLabel.pending_review}
                </span>
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">{formatMoney(selected.amount)} so&apos;m</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600" aria-label="Yopish">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm space-y-1.5">
              {/* Historical request: show the fee ACTUALLY charged on this row.
                  The rate is deliberately not printed — rows predate the fee (0%),
                  or were made at 3% before #51 — so asserting today's rate here
                  would misstate money that already moved. */}
              <p className="text-gray-500">Komissiya: <span className="font-semibold text-red-600">−{formatMoney(selected.commission_amount ?? 0)} so&apos;m</span></p>
              <p className="text-gray-500">Sizga to&apos;lanadi: <span className="font-black text-brand-600">{formatMoney(selected.payout_amount ?? selected.amount)} so&apos;m</span></p>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">To&apos;lov ma&apos;lumotlari</p>
                {selected.snap_card_type ? (
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200 space-y-0.5">
                    {/* The last-4 is resolved server-side (encrypted value first,
                        legacy plaintext as a phase-2 fallback) — the full card
                        number is never sent to the browser. */}
                    <p>{cardTypeLabel(selected.snap_card_type)} · {maskFromLast4(selected.snap_secret_last4)}</p>
                    {selected.snap_cardholder_name && <p>{selected.snap_cardholder_name}</p>}
                    {selected.snap_phone && <p>{selected.snap_phone}</p>}
                    {selected.snap_bank_name && <p>{selected.snap_bank_name}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words rounded-xl bg-gray-50 dark:bg-gray-800 p-3">{selected.account_details}</p>
                )}
              </div>
              {selected.notes && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">Izoh</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{selected.notes}</p>
                </div>
              )}
              {selected.admin_note && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">Admin izohi</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words rounded-xl bg-yellow-50 dark:bg-yellow-900/20 p-3">{selected.admin_note}</p>
                </div>
              )}
              {selected.payout_reference && (
                <p className="text-gray-500 mt-2">To&apos;lov ma&apos;lumotnomasi: <span className="font-semibold text-gray-800 dark:text-gray-200">{selected.payout_reference}</span></p>
              )}
            </div>

            {/* Timeline */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tarix</p>
              <ol className="relative ml-2 border-l-2 border-gray-100 dark:border-gray-800 space-y-3">
                {selected.events.map((e) => (
                  <li key={e.id} className="ml-4">
                    <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{ACTION[e.action] ?? e.action}</p>
                    {e.note && <p className="text-xs text-gray-500 whitespace-pre-wrap break-words">{e.note}</p>}
                    <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(e.created_at)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
