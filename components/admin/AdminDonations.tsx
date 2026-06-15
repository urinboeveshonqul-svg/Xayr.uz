'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Check, X, Loader2, Search, HandCoins } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import type { DonationStatus, PaymentMethod } from '@/types';

export interface DonationRow {
  id: string;
  campaign_id: string;
  donor_id: string | null;
  amount: number;
  anonymous: boolean;
  message: string | null;
  status: DonationStatus;
  payment_method: PaymentMethod | null;
  created_at: string;
  campaign_title: string | null;
  campaign_slug: string | null;
  donor_name: string | null;
  donor_email: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Kutilmoqda',   cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  completed: { label: 'Tasdiqlangan', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  failed:    { label: 'Rad etilgan',  cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  refunded:  { label: 'Qaytarilgan',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
};

const FILTERS: { value: DonationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Barchasi' },
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'completed', label: 'Tasdiqlangan' },
  { value: 'failed', label: 'Rad etilgan' },
];

export function AdminDonations({ initialRows, locale }: { initialRows: DonationRow[]; locale: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<DonationRow[]>(initialRows);
  const [filter, setFilter] = useState<DonationStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        (r.campaign_title ?? '').toLowerCase().includes(q) ||
        (r.donor_name ?? '').toLowerCase().includes(q) ||
        (r.donor_email ?? '').toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    });
  }, [rows, filter, query]);

  const act = async (id: string, action: 'confirm' | 'reject') => {
    if (action === 'reject' && !window.confirm('Bu xayriyani rad etmoqchimisiz?')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donationId: id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || 'Amalni bajarib bo‘lmadi');
        return;
      }
      // Optimistic local update; refresh to re-pull credited campaign totals.
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: action === 'confirm' ? 'completed' : 'failed' } : r))
      );
      toast.success(action === 'confirm' ? 'Xayriya tasdiqlandi' : 'Xayriya rad etildi');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {/* Search + status filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kampaniya, ism yoki summa bo‘yicha qidirish"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`badge cursor-pointer transition-all ${
                filter === f.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <HandCoins className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          Xayriyalar topilmadi
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const st = STATUS[r.status] ?? STATUS.pending;
            return (
              <article key={r.id} className="card p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {formatMoney(r.amount)} so‘m
                    </span>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    {r.payment_method && (
                      <span className="text-xs text-gray-400 uppercase">{r.payment_method}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate mt-0.5">
                    {r.campaign_title ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.anonymous ? 'Anonim' : r.donor_name ?? r.donor_email ?? 'Mehmon'} ·{' '}
                    {new Date(r.created_at).toLocaleString('uz-UZ')}
                  </p>
                  {r.message && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic truncate">“{r.message}”</p>
                  )}
                </div>

                {r.status === 'pending' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => act(r.id, 'confirm')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-60"
                    >
                      {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Tasdiqlash
                    </button>
                    <button
                      onClick={() => act(r.id, 'reject')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 transition-colors disabled:opacity-60"
                    >
                      <X className="w-4 h-4" />
                      Rad etish
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
