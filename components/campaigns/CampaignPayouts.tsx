'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Wallet, Plus, X, Loader2, Clock, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, timeAgo } from '@/lib/utils';
import type { PostgrestError } from '@supabase/supabase-js';
import type { PayoutRequest, PayoutRequestEvent, PayoutMethod } from '@/types';

export interface CampaignPayoutRow extends PayoutRequest {
  events: PayoutRequestEvent[];
}

const ACTIVE = ['pending_review', 'approved', 'info_requested'];

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "Ko'rib chiqilmoqda", cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  approved:       { label: 'Tasdiqlangan',        cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  info_requested: { label: "Ma'lumot so'ralgan",  cls: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
  rejected:       { label: 'Rad etilgan',          cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  paid:           { label: "To'langan",            cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  cancelled:      { label: 'Bekor qilingan',       cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
};

const ACTION: Record<string, string> = {
  created:        "So'rov yaratildi",
  approved:       'Tasdiqlandi',
  rejected:       'Rad etildi',
  info_requested: "Ma'lumot so'raldi",
  paid:           "To'landi",
  cancelled:      'Bekor qilindi',
};

const ERR: Record<string, string> = {
  auth_required:            'Kirish talab qilinadi',
  not_campaign_owner:       "Ruxsat yo'q",
  campaign_not_approved:    'Kampaniya tasdiqlanmagan',
  owner_not_verified:       'Hisobingiz tasdiqlanmagan',
  invalid_amount:           "Noto'g'ri miqdor",
  invalid_method:           "Noto'g'ri usul",
  account_details_required: "Hisob ma'lumotlari kiritilishi shart",
  active_request_exists:    "Sizda faol so'rov allaqachon mavjud",
  amount_exceeds_available: "Mablag' yetarli emas",
};

export function CampaignPayouts({
  campaignId,
  campaignStatus,
  available,
  isVerified,
  requests,
  locale: _locale,
}: {
  campaignId: string;
  campaignStatus: string;
  available: number;
  isVerified: boolean;
  requests: CampaignPayoutRow[];
  locale: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod>('bank');
  const [account, setAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hasActive = requests.some((r) => ACTIVE.includes(r.status));
  const approved = campaignStatus === 'active' || campaignStatus === 'completed';
  const canRequest = isVerified && approved && available > 0 && !hasActive;
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const blockedReason = !approved
    ? 'Kampaniya tasdiqlangandan keyin mablag’ yechib olish mumkin'
    : !isVerified
    ? 'Yechish uchun hisobingizni tasdiqlang'
    : hasActive
    ? "Sizda faol so'rov mavjud — natijani kuting"
    : available <= 0
    ? "Yechish uchun mavjud mablag' yo'q"
    : null;

  const resetForm = () => {
    setAmount('');
    setMethod('bank');
    setAccount('');
    setNotes('');
    setAgree(false);
    setShowForm(false);
  };

  // Display-only preview; the authoritative fee is computed in the DB function.
  const previewAmt = Math.floor(Number(amount)) || 0;
  const previewFee = Math.round(previewAmt * 0.03);
  const previewNet = previewAmt - previewFee;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.floor(Number(amount));
    if (!amt || amt <= 0) { toast.error("Noto'g'ri miqdor"); return; }
    if (amt > available) { toast.error("Mablag' yetarli emas"); return; }
    if (!account.trim()) { toast.error("Hisob ma'lumotlari kiritilishi shart"); return; }
    if (!agree) { toast.error("Komissiya shartlarini tasdiqlang"); return; }

    setSubmitting(true);
    try {
      const { error }: { error: PostgrestError | null } = await createClient().rpc('create_payout_request', {
        p_campaign_id: campaignId,
        p_amount: amt,
        p_method: method,
        p_account_details: account.trim(),
        p_notes: notes.trim(),
      });
      if (error) { toast.error(ERR[error.message] ?? error.message); return; }
      toast.success("So'rov yuborildi");
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8">
      <div className="card p-6">
        {/* Balance + request action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Yechish uchun mavjud mablag&apos;</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{formatMoney(available)} so&apos;m</p>
            </div>
          </div>

          {canRequest ? (
            <button onClick={() => setShowForm(true)} className="btn-primary px-5 py-2.5">
              <Plus className="w-4 h-4" /> Mablag&apos;ni yechish
            </button>
          ) : (
            blockedReason && <p className="text-sm text-gray-400 max-w-xs">{blockedReason}</p>
          )}
        </div>

        {/* Requests list */}
        {requests.length > 0 && (
          <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-5 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">So&apos;rovlar tarixi</p>
            {requests.map((r) => {
              const st = STATUS[r.status] ?? STATUS.pending_review;
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
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Request form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}
        >
          <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 my-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Mablag&apos;ni yechish</h3>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600" aria-label="Yopish">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="label">Miqdor (max {formatMoney(available)} so&apos;m)</label>
              <input
                type="number"
                min={1}
                max={available}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">Usul</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)} className="input">
                <option value="bank">Bank o&apos;tkazmasi</option>
                <option value="card">Karta</option>
              </select>
            </div>

            <div>
              <label className="label">Hisob ma&apos;lumotlari</label>
              <textarea
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                rows={3}
                className="input resize-none"
                placeholder={method === 'bank' ? 'Bank nomi, hisob raqami, MFO...' : 'Karta raqami, egasi...'}
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
                  <span className="text-gray-500">Yechish miqdori</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatMoney(previewAmt)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Platforma komissiyasi (3%)</span>
                  <span className="font-bold text-red-600">−{formatMoney(previewFee)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <span className="font-bold text-gray-900 dark:text-white">Sizga to&apos;lanadi</span>
                  <span className="font-black text-brand-600">{formatMoney(previewNet)} so&apos;m</span>
                </div>
              </div>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="w-4 h-4 accent-brand-600 mt-0.5"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                3% platforma komissiyasiga roziman. Bu komissiya hosting, xavfsizlik,
                tasdiqlash, to&apos;lov tizimlari va platforma rivojini qoplaydi.
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 my-8 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`badge ${(STATUS[selected.status] ?? STATUS.pending_review).cls}`}>
                  {(STATUS[selected.status] ?? STATUS.pending_review).label}
                </span>
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">{formatMoney(selected.amount)} so&apos;m</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600" aria-label="Yopish">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm space-y-1.5">
              <p className="text-gray-500">Usul: <span className="font-semibold text-gray-800 dark:text-gray-200">{selected.method === 'bank' ? 'Bank' : 'Karta'}</span></p>
              <p className="text-gray-500">Komissiya (3%): <span className="font-semibold text-red-600">−{formatMoney(selected.commission_amount ?? 0)} so&apos;m</span></p>
              <p className="text-gray-500">Sizga to&apos;lanadi: <span className="font-black text-brand-600">{formatMoney(selected.payout_amount ?? selected.amount)} so&apos;m</span></p>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">Hisob ma&apos;lumotlari</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words rounded-xl bg-gray-50 dark:bg-gray-800 p-3">{selected.account_details}</p>
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
