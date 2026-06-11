'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Wallet, X, ExternalLink, Loader2, Check, Ban, HelpCircle, BadgeDollarSign, Clock, User,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, timeAgo } from '@/lib/utils';
import type { PostgrestError } from '@supabase/supabase-js';
import type { PayoutRequest, PayoutRequestEvent } from '@/types';

export interface PayoutRow extends PayoutRequest {
  campaign_title: string | null;
  campaign_slug: string | null;
  owner_name: string | null;
  owner_email: string | null;
  raised: number;
  available: number;
  events: PayoutRequestEvent[];
}

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
  admin_required:     "Ruxsat yo'q",
  invalid_transition: "Bu amalni bajarib bo'lmaydi",
  request_not_found:  "So'rov topilmadi",
  reason_required:    'Sabab kiritilishi shart',
  note_required:      'Izoh kiritilishi shart',
  reference_required: "To'lov ma'lumotnomasi kiritilishi shart",
};

const FILTERS = [
  { value: 'pending_review', label: "Ko'rib chiqilmoqda" },
  { value: 'info_requested', label: "Ma'lumot so'ralgan" },
  { value: 'approved', label: 'Tasdiqlangan' },
  { value: 'all', label: 'Barchasi' },
];

export function AdminPayouts({ initialRows, locale }: { initialRows: PayoutRow[]; locale: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState('pending_review');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => initialRows.filter((r) => filter === 'all' || r.status === filter),
    [initialRows, filter]
  );
  const selected = initialRows.find((r) => r.id === selectedId) ?? null;
  const pendingCount = initialRows.filter((r) => r.status === 'pending_review').length;

  // Platform revenue from collected commissions (paid payouts only).
  const revenue = useMemo(() => {
    const now = new Date();
    const paid = initialRows.filter((r) => r.status === 'paid');
    const sum = (rows: typeof paid) => rows.reduce((s, r) => s + (r.commission_amount ?? 0), 0);
    return {
      total: sum(paid),
      month: sum(paid.filter((r) => {
        if (!r.paid_at) return false;
        const d = new Date(r.paid_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })),
      year: sum(paid.filter((r) => r.paid_at && new Date(r.paid_at).getFullYear() === now.getFullYear())),
    };
  }, [initialRows]);

  const closeDetail = () => { setSelectedId(null); setNote(''); };

  const finish = (error: PostgrestError | null, okMsg: string) => {
    if (error) { toast.error(ERR[error.message] ?? error.message); return; }
    toast.success(okMsg);
    closeDetail();
    router.refresh();
  };

  const approve = async (r: PayoutRow) => {
    setBusy(true);
    try {
      const { error } = await createClient().rpc('approve_payout_request', { p_request_id: r.id, p_note: note.trim() || undefined });
      finish(error, 'Tasdiqlandi');
    } finally { setBusy(false); }
  };
  const reject = async (r: PayoutRow) => {
    if (!note.trim()) { toast.error('Sabab kiritilishi shart'); return; }
    setBusy(true);
    try {
      const { error } = await createClient().rpc('reject_payout_request', { p_request_id: r.id, p_note: note.trim() });
      finish(error, 'Rad etildi');
    } finally { setBusy(false); }
  };
  const requestInfo = async (r: PayoutRow) => {
    if (!note.trim()) { toast.error('Izoh kiritilishi shart'); return; }
    setBusy(true);
    try {
      const { error } = await createClient().rpc('request_payout_info', { p_request_id: r.id, p_note: note.trim() });
      finish(error, "Ma'lumot so'raldi");
    } finally { setBusy(false); }
  };
  const markPaid = async (r: PayoutRow) => {
    if (!note.trim()) { toast.error("To'lov ma'lumotnomasi kiritilishi shart"); return; }
    setBusy(true);
    try {
      const { error } = await createClient().rpc('mark_payout_paid', { p_request_id: r.id, p_reference: note.trim() });
      finish(error, "To'langan deb belgilandi");
    } finally { setBusy(false); }
  };

  return (
    <div>
      {/* Platform revenue (3% commissions, collected at payout) */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Jami komissiya', value: revenue.total },
          { label: 'Shu oy', value: revenue.month },
          { label: 'Shu yil', value: revenue.year },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-base sm:text-lg font-black text-brand-600 break-words leading-tight">
              {formatMoney(s.value)} so&apos;m
            </div>
            <div className="text-xs text-gray-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filter === f.value
                ? 'bg-brand-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20'
            }`}
          >
            {f.value === 'pending_review' && pendingCount > 0 ? `${f.label} (${pendingCount})` : f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="card p-12 text-center">
          <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">So&apos;rovlar yo&apos;q</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const st = STATUS[r.status] ?? STATUS.pending_review;
            return (
              <button
                key={r.id}
                onClick={() => { setSelectedId(r.id); setNote(''); }}
                className="w-full text-left card p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-md transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {r.campaign_title ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {r.owner_name ?? 'Anonim'}{r.owner_email ? ` · ${r.owner_email}` : ''} · {timeAgo(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-black text-gray-900 dark:text-white">{formatMoney(r.amount)} so&apos;m</div>
                    <div className="text-[11px] text-gray-400">Mavjud: {formatMoney(r.available)}</div>
                  </div>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg my-8 animate-pop">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="min-w-0">
                <span className={`badge ${(STATUS[selected.status] ?? STATUS.pending_review).cls}`}>
                  {(STATUS[selected.status] ?? STATUS.pending_review).label}
                </span>
                {selected.campaign_slug ? (
                  <Link
                    href={`/${locale}/campaigns/${selected.campaign_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-black text-gray-900 dark:text-white mt-2 hover:text-brand-600 truncate"
                  >
                    {selected.campaign_title} <ExternalLink className="inline w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <p className="font-black text-gray-900 dark:text-white mt-2">{selected.campaign_title ?? '—'}</p>
                )}
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Yopish">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Amounts */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="text-sm font-black text-gray-900 dark:text-white">{formatMoney(selected.amount)}</div>
                  <div className="text-[11px] text-gray-400">So&apos;ralgan</div>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="text-sm font-black text-gray-900 dark:text-white">{formatMoney(selected.available)}</div>
                  <div className="text-[11px] text-gray-400">Mavjud</div>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="text-sm font-black text-gray-900 dark:text-white">{formatMoney(selected.raised)}</div>
                  <div className="text-[11px] text-gray-400">Yig&apos;ilgan</div>
                </div>
              </div>

              {/* Commission breakdown (3% platform fee, charged to the creator) */}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">So&apos;ralgan miqdor</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatMoney(selected.amount)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Platforma komissiyasi (3%)</span>
                  <span className="font-bold text-red-600">−{formatMoney(selected.commission_amount ?? 0)} so&apos;m</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <span className="font-bold text-gray-900 dark:text-white">Egaga to&apos;lanadi</span>
                  <span className="font-black text-brand-600">{formatMoney(selected.payout_amount ?? selected.amount)} so&apos;m</span>
                </div>
              </div>

              {/* Owner + method */}
              <div className="text-sm space-y-1.5">
                <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <User className="w-4 h-4 text-gray-400" />
                  {selected.owner_name ?? 'Anonim'}{selected.owner_email ? ` · ${selected.owner_email}` : ''}
                </p>
                <p className="text-gray-500">Usul: <span className="font-semibold text-gray-800 dark:text-gray-200">{selected.method === 'bank' ? 'Bank' : 'Karta'}</span></p>
              </div>

              {/* Account details (PII) */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Hisob ma&apos;lumotlari</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                  {selected.account_details}
                </p>
              </div>

              {/* Owner notes */}
              {selected.notes && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Izoh</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{selected.notes}</p>
                </div>
              )}

              {/* Audit history / status timeline */}
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

              {/* Actions (depend on status) */}
              {(selected.status === 'pending_review' || selected.status === 'info_requested' || selected.status === 'approved') && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder={
                      selected.status === 'approved'
                        ? "To'lov ma'lumotnomasi (majburiy)"
                        : "Izoh / sabab (rad etish va ma'lumot so'rash uchun majburiy)"
                    }
                    className="input resize-none text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(selected.status === 'pending_review' || selected.status === 'info_requested') && (
                      <button onClick={() => approve(selected)} disabled={busy} className="btn-primary px-4 py-2 text-sm">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Tasdiqlash
                      </button>
                    )}
                    {selected.status === 'pending_review' && (
                      <button onClick={() => requestInfo(selected)} disabled={busy} className="btn-ghost px-4 py-2 text-sm">
                        <HelpCircle className="w-4 h-4" /> Ma&apos;lumot so&apos;rash
                      </button>
                    )}
                    {(selected.status === 'pending_review' || selected.status === 'info_requested') && (
                      <button onClick={() => reject(selected)} disabled={busy} className="px-4 py-2 text-sm font-bold rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5">
                        <Ban className="w-4 h-4" /> Rad etish
                      </button>
                    )}
                    {selected.status === 'approved' && (
                      <button onClick={() => markPaid(selected)} disabled={busy} className="btn-primary px-4 py-2 text-sm">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeDollarSign className="w-4 h-4" />} To&apos;langan deb belgilash
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
