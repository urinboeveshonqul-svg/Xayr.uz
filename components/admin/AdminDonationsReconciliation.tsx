'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search, HandCoins } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import type { DonationStatus, PaymentEvent } from '@/types';

export interface ReconRow {
  id: string;
  payment_ref: string | null;
  payment_method: string | null;
  donor_name: string | null;
  campaign_title: string | null;
  amount: number;
  status: DonationStatus;
  created_at: string;
  events: PaymentEvent[];
}

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  completed: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  failed: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  refunded: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

/**
 * VIEW-ONLY donation reconciliation. No approve/reject — donations complete only
 * via verified gateway webhooks. Shows each donation with its logged
 * payment_events (webhook history + duplicate callback attempts) for audit.
 */
export function AdminDonationsReconciliation({ rows }: { rows: ReconRow[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DonationStatus | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);

  const providers = useMemo(
    () => [...new Set(rows.map((r) => r.payment_method).filter((p): p is string => !!p))],
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (providerFilter !== 'all' && r.payment_method !== providerFilter) return false;
      if (!q) return true;
      return (
        (r.payment_ref ?? '').toLowerCase().includes(q) ||
        (r.campaign_title ?? '').toLowerCase().includes(q) ||
        (r.donor_name ?? '').toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    });
  }, [rows, query, statusFilter, providerFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ref, kampaniya, ism yoki summa…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DonationStatus | 'all')} className="input sm:w-40">
          <option value="all">Barchasi</option>
          <option value="pending">Kutilmoqda</option>
          <option value="completed">Tasdiqlangan</option>
          <option value="failed">Amalga oshmagan</option>
          <option value="refunded">Qaytarilgan</option>
        </select>
        {providers.length > 0 && (
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="input sm:w-40">
            <option value="all">Barcha provayder</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      <p className="text-sm text-gray-500">{visible.length} ta yozuv</p>

      {visible.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <HandCoins className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          Yozuvlar topilmadi
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const expanded = open === r.id;
            return (
              <article key={r.id} className="card p-4">
                <button
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 dark:text-white">{formatMoney(r.amount)} so‘m</span>
                      <span className={`badge ${STATUS_CLS[r.status] ?? ''}`}>{r.status}</span>
                      {r.payment_method && <span className="text-xs text-gray-400 uppercase">{r.payment_method}</span>}
                      {r.events.length > 0 && (
                        <span className="text-xs text-gray-400">· {r.events.length} event</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate mt-0.5">{r.campaign_title ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono break-all">{r.payment_ref ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.donor_name ?? 'Anonim'} · {new Date(r.created_at).toLocaleString('uz-UZ')}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Webhook tarixi</p>
                    {r.events.length === 0 ? (
                      <p className="text-xs text-gray-400">Hozircha to‘lov hodisalari yo‘q</p>
                    ) : (
                      <ul className="space-y-2">
                        {r.events.map((e) => (
                          <li key={e.id} className="text-xs rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-semibold">{e.provider} · {e.status ?? '—'}</span>
                              <span className="text-gray-400">{new Date(e.received_at).toLocaleString('uz-UZ')}</span>
                            </div>
                            <div className="text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                              {e.provider_event_id && <p className="font-mono break-all">event: {e.provider_event_id}</p>}
                              {e.amount != null && <p>amount: {e.amount} {e.currency ?? ''}</p>}
                              <p>
                                signature: {e.signature_valid == null ? '—' : e.signature_valid ? '✓' : '✕'} ·{' '}
                                processed: {e.processed ? '✓' : '✕'}
                              </p>
                              {e.error_message && <p className="text-red-500 break-words">error: {e.error_message}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
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
