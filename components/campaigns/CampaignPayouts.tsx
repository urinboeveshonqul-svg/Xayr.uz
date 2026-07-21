'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Wallet, Plus, X, Loader2, Clock, Send, CreditCard, Info, Pencil, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PayoutAccountForm } from '@/components/profile/PayoutAccountForm';
import { formatAmount, timeAgo } from '@/lib/utils';
import {
  MIN_WITHDRAWAL_NET,
  calcNetPayout,
  grossForNet,
  maskCard,
  cardTypeLabel,
} from '@/lib/payout';
import type { PostgrestError } from '@supabase/supabase-js';
import type { PayoutRequest, PayoutRequestEvent, PayoutAccount } from '@/types';

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

// Event-log action → translation key. Resolved through t() at render so the
// label follows the active language (was a hardcoded Uzbek map).
const ACTION_KEYS: Record<string, string> = {
  created:        'dash.actCreated',
  approved:       'dash.actApproved',
  rejected:       'dash.actRejected',
  info_requested: 'dash.actInfoRequested',
  paid:           'dash.actPaid',
  cancelled:      'dash.actCancelled',
};

// RPC error code → translation key. Resolved through t() at call time so the
// message follows the active language (was a hardcoded Uzbek map).
const ERR_KEYS: Record<string, string> = {
  auth_required:            'toasts.payoutErrAuthRequired',
  campaign_not_found:       'toasts.payoutErrCampaignNotFound',
  not_campaign_owner:       'toasts.payoutErrNotOwner',
  campaign_not_approved:    'toasts.payoutErrNotApproved',
  owner_not_verified:       'toasts.payoutErrNotVerified',
  payout_info_required:     'toasts.payoutErrInfoRequired',
  invalid_amount:           'toasts.payoutErrInvalidAmount',
  invalid_method:           'toasts.payoutErrInvalidMethod',
  active_request_exists:    'toasts.payoutErrActiveExists',
  amount_exceeds_available: 'toasts.payoutErrExceedsAvailable',
  insufficient_balance:     'toasts.payoutErrExceedsAvailable',
  below_minimum:            'toasts.payoutErrBelowMinimum',
};

// Every code the create_payout_request RPC can `raise` — used to tell an
// expected business-rule rejection (show its localized message) from an
// unexpected server/DB fault (show a friendly fallback + log the raw error).
const KNOWN_RPC_ERRORS = new Set([...Object.keys(ERR_KEYS), 'below_minimum']);

export function CampaignPayouts({
  campaignId,
  campaignStatus,
  userId,
  available,
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
  // configurable minimum (shown in NET so'm — the unit the creator types in);
  // anything unmapped falls back to a generic message rather than surfacing a
  // raw backend string.
  const errMsg = (code: string): string => {
    if (code === 'below_minimum') return t('toasts.payoutErrBelowMinimum', { min: formatAmount(MIN_WITHDRAWAL_NET) });
    const key = ERR_KEYS[code];
    // A mapped business-rule code shows its own message; anything else (a raw
    // Postgres/PostgREST fault) shows a friendly, actionable localized fallback
    // — never a raw backend string, and never a vague "something went wrong".
    return key ? t(key) : t('toasts.withdrawFailed');
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
  const [payoutInitial, setPayoutInitial] = useState<PayoutAccount | null>(null);
  const [loadingPayout, setLoadingPayout] = useState(false);

  // ── SINGLE SOURCE OF TRUTH for every number the creator sees ──
  // `available` is the GROSS balance (mirror of campaign_available_balance).
  // The creator-facing figure everywhere is the NET: the exact amount they can
  // request AND receive today. grossForNet() inverts calcNetPayout() exactly,
  // so availableNet ≥ n  ⟺  available ≥ grossForNet(n) — client gates and the
  // server's guards can never disagree.
  const availableNet = calcNetPayout(available);

  const hasActive = requests.some((r) => ACTIVE.includes(r.status));
  const approved = campaignStatus === 'active' || campaignStatus === 'completed' || campaignStatus === 'funded';
  const canRequest = isVerified && hasPayoutInfo && approved && availableNet >= MIN_WITHDRAWAL_NET && !hasActive;
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

  // Open the editor for an EXISTING account: fetch the full (unmasked) record so
  // the form prefills, then mount it. RLS limits this to the owner's own row.
  const startEditPayout = async () => {
    setEditingPayout(true);
    setLoadingPayout(true);
    try {
      const { data } = await createClient()
        .from('payout_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      setPayoutInitial((data as PayoutAccount | null) ?? null);
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
    ? t('dash.blockedNotApproved')
    : !isVerified
    ? t('dash.blockedNotVerified')
    : !hasPayoutInfo
    ? null // handled by the inline payout setup form above
    : hasActive
    ? t('dash.blockedHasActive')
    : availableNet < MIN_WITHDRAWAL_NET
    ? t('dash.withdrawNeedMinimum', { min: formatAmount(MIN_WITHDRAWAL_NET) })
    : null;

  const resetForm = () => {
    setAmount('');
    setNotes('');
    setAgree(false);
    setShowForm(false);
  };

  // Live preview. The creator works entirely in NET so'm: the amount they type
  // is exactly what they will receive (the platform fee is already excluded from
  // `availableNet`, so it is never shown or subtracted again in this dialog).
  //   you receive === entered amount, and remaining = availableNet − entered.
  // Withdrawing the full availableNet leaves remaining 0.
  const previewNet = Math.floor(Number(amount)) || 0;
  const previewRemaining = Math.max(0, availableNet - previewNet);

  // ── Live, localized amount validation (custom — no native browser popup) ──
  // Valid range is [MIN_WITHDRAWAL_NET, availableNet] in NET so'm. Errors show
  // only once something is typed, update on every keystroke, and gate Submit.
  const amountEntered = amount.trim() !== '';
  const amountTooLow = amountEntered && previewNet < MIN_WITHDRAWAL_NET;
  const amountTooHigh = amountEntered && previewNet > availableNet;
  const amountValid = amountEntered && !amountTooLow && !amountTooHigh;
  // The single localized validation message for the current invalid state. Both
  // bounds are derived at runtime (MIN_WITHDRAWAL_NET from the business rule,
  // availableNet from the live account state) — never hardcoded.
  const amountErrorMsg: string | null = amountTooHigh
    ? t('dash.withdrawErrExceeds')
    : amountTooLow
    ? t('dash.withdrawErrBelowMin', { min: `${formatAmount(MIN_WITHDRAWAL_NET)} so'm` })
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const net = Math.floor(Number(amount));
    if (!net || net <= 0) { toast.error(t('toasts.withdrawInvalidAmount')); return; }
    if (net < MIN_WITHDRAWAL_NET) { toast.error(errMsg('below_minimum')); return; }
    if (net > availableNet) { toast.error(t('toasts.withdrawInsufficient')); return; }
    if (!agree) { toast.error(t('toasts.withdrawAgreeFee')); return; }

    // The server keeps gross semantics (create_payout_request deducts the gross
    // and pays gross − round(gross·4%)). Convert the entered NET to the exact
    // gross whose server-computed payout equals it — no further deduction can
    // occur after this point. Withdrawing the full net maps to the full gross
    // balance, so nothing is left stranded.
    const gross = net === availableNet ? available : grossForNet(net);

    setSubmitting(true);
    try {
      // Payout details (card etc.) are taken from the saved payout account and
      // snapshotted server-side — the client never sends them here.
      const { error }: { error: PostgrestError | null } = await createClient().rpc('create_payout_request', {
        p_campaign_id: campaignId,
        p_amount: gross,
        p_notes: notes.trim(),
      });
      if (error) {
        // NEVER hide the error. Business-rule rejections (a `raise`d code) are
        // expected; anything else is a real server/DB fault worth logging in
        // full (message + SQLSTATE + details + hint) for debugging. The creator
        // only ever sees a friendly, localized message.
        if (!KNOWN_RPC_ERRORS.has(error.message)) {
          console.error('[withdraw] create_payout_request failed', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            campaignId,
            gross,
          });
        }
        toast.error(errMsg(error.message));
        return;
      }
      toast.success(t('toasts.withdrawRequested'));
      resetForm();
      router.refresh();
    } catch (err) {
      // Network/unexpected client-side failure — log it, show a friendly message.
      console.error('[withdraw] create_payout_request threw', err);
      toast.error(t('toasts.withdrawFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8">
      <div className="card p-6">
        {/* No funds summary here — the Financial breakdown card above already
            leads to "Available to withdraw" (net). This card is just the action:
            payout destination → withdraw → history. One number, one place. */}

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
                    {/* NET actually/to-be received — matches the amount the creator
                        entered. Historical rows show the payout stored at their own
                        rate (0% pre-fee, 3% pre-#51), never re-derived. */}
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatAmount(r.payout_amount ?? r.amount)} so&apos;m</p>
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
          <form onSubmit={submit} noValidate className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 my-8 space-y-4 animate-pop">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">{t('dash.withdrawBtn')}</h3>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600" aria-label={t('ux.close')}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PRIMARY value: Available to withdraw — the one number every other
                figure in this dialog derives from, with a one-line explanation of
                where it comes from. Same wording as the dashboard card. */}
            <div className="rounded-xl bg-brand-50 dark:bg-brand-900/20 p-4">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-brand-600" />
                <p className="text-xs text-brand-700/80 dark:text-brand-400/90">{t('dash.availableBalance')}</p>
              </div>
              <p className="text-2xl font-black text-brand-700 dark:text-brand-400 break-words leading-tight">{formatAmount(availableNet)} so&apos;m</p>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('dash.availableExplain')}</p>
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
              <label className="label" htmlFor="withdraw-amount">{t('dash.withdrawAmount')}</label>
              <div className="relative">
                <input
                  id="withdraw-amount"
                  type="number"
                  inputMode="numeric"
                  min={MIN_WITHDRAWAL_NET}
                  max={availableNet}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={!!amountErrorMsg}
                  aria-describedby={amountErrorMsg ? 'withdraw-amount-error' : 'withdraw-amount-hint'}
                  className={`input pr-16 ${amountErrorMsg ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(availableNet))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 text-xs font-bold text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
                >
                  {t('dash.withdrawMax')}
                </button>
              </div>
              {/* Custom localized validation, replacing the browser's native popup.
                  Announced to screen readers (role="alert" + aria-describedby on the
                  input) and updated live on every keystroke. */}
              {amountErrorMsg ? (
                <div className="mt-1.5">
                  <p id="withdraw-amount-error" role="alert" className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{amountErrorMsg}</span>
                  </p>
                  {/* Below the message: the current max (runtime availableNet) and a
                      one-tap "Use maximum amount" — filling the exact max is valid,
                      so the payout preview appears immediately. Both shown for any
                      invalid entry (over or under), never hardcoded. */}
                  <p className="mt-1 ml-5 text-xs text-gray-500 dark:text-gray-400">
                    {t('dash.withdrawErrMaxToday', { max: `${formatAmount(availableNet)} so'm` })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAmount(String(availableNet))}
                    className="mt-1 ml-5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {t('dash.useMaxAmount')}
                  </button>
                </div>
              ) : (
                /* Min/max hints — both in NET so'm (the unit the creator types in);
                   the max always mirrors the available amount and updates
                   automatically when it changes (no hardcoded maximum). */
                <div id="withdraw-amount-hint" className="mt-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{t('dash.withdrawMinLabel')}: {formatAmount(MIN_WITHDRAWAL_NET)} so&apos;m</span>
                  <span>{t('dash.withdrawMaxLabel')}: {formatAmount(availableNet)} so&apos;m</span>
                </div>
              )}
            </div>

            <div>
              <label className="label">{t('dash.noteOptional')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input resize-none"
                placeholder={t('dash.notePlaceholder')}
              />
            </div>

            {/* Financial preview — shown ONLY for a valid amount, so it never
                displays an impossible transaction. Answers only "how much can I
                receive today?"; no platform-fee row (already reflected in
                "Available to withdraw", so entered amount IS what's received).
                When the amount is empty/invalid, an informational placeholder
                takes its place instead (never conflicting figures). */}
            {amountValid ? (
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('dash.withdrawAmount')}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatAmount(previewNet)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <span className="font-bold text-gray-900 dark:text-white">{t('dash.youReceive')}</span>
                  <span className="font-black text-brand-600">{formatAmount(previewNet)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('dash.withdrawRemaining')}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{formatAmount(previewRemaining)} so&apos;m</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-sm" aria-live="polite">
                <p className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
                  <Info className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                  {t('dash.previewTitle')}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('dash.previewIntro', {
                    min: `${formatAmount(MIN_WITHDRAWAL_NET)} so'm`,
                    max: `${formatAmount(availableNet)} so'm`,
                  })}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" aria-hidden="true" />
                    {t('dash.previewBullet1')}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" aria-hidden="true" />
                    {t('dash.previewBullet2')}
                  </li>
                </ul>
              </div>
            )}

            {/* Short reassurance — no fee figures; reinforces that the entered
                amount is exactly what is paid out. */}
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

            {/* What happens after submitting — stated at the decision point (the
                page's fuller processing card is hidden behind the modal overlay). */}
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {t('dash.afterSubmitNote')}
            </p>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="btn-ghost px-4 py-2 text-sm">{t('ux.cancel')}</button>
              <button type="submit" disabled={submitting || !amountValid} className="btn-primary px-5 py-2 text-sm">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('dash.submitting')}</> : <><Send className="w-4 h-4" /> {t('ux.submit')}</>}
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
                {/* Headline = the NET the creator receives (what they entered). */}
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">{formatAmount(selected.payout_amount ?? selected.amount)} so&apos;m</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600" aria-label={t('ux.close')}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm space-y-1.5">
              {/* Reconciling breakdown from the STORED row: gross deducted from the
                  balance − fee actually charged = the net headline. The rate is
                  deliberately not printed — rows predate the fee (0%), or were made
                  at 3% before #51 — so asserting today's rate here would misstate
                  money that already moved. */}
              <p className="text-gray-500">{t('dash.grossDeducted')}: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatAmount(selected.amount)} so&apos;m</span></p>
              <p className="text-gray-500">{t('dash.commission')}: <span className="font-semibold text-red-600">−{formatAmount(selected.commission_amount ?? 0)} so&apos;m</span></p>
              <p className="text-gray-500">{t('dash.youReceive')}: <span className="font-black text-brand-600">{formatAmount(selected.payout_amount ?? selected.amount)} so&apos;m</span></p>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">{t('dash.paymentDetails')}</p>
                {selected.snap_card_type ? (
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200 space-y-0.5">
                    <p>{cardTypeLabel(selected.snap_card_type)} · {maskCard(selected.snap_card_number)}</p>
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
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">{t('dash.reqNote')}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{selected.notes}</p>
                </div>
              )}
              {selected.admin_note && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">{t('dash.adminNote')}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words rounded-xl bg-yellow-50 dark:bg-yellow-900/20 p-3">{selected.admin_note}</p>
                </div>
              )}
              {selected.payout_reference && (
                <p className="text-gray-500 mt-2">{t('dash.paymentReference')}: <span className="font-semibold text-gray-800 dark:text-gray-200">{selected.payout_reference}</span></p>
              )}
            </div>

            {/* Timeline */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('dash.eventHistory')}</p>
              <ol className="relative ml-2 border-l-2 border-gray-100 dark:border-gray-800 space-y-3">
                {selected.events.map((e) => (
                  <li key={e.id} className="ml-4">
                    <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{ACTION_KEYS[e.action] ? t(ACTION_KEYS[e.action]) : e.action}</p>
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
