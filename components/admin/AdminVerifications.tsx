'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Eye, Check, X } from 'lucide-react';

export interface VerificationRow {
  id: string;
  user_id: string;
  legal_name: string;
  date_of_birth: string;
  address: string;
  phone: string | null;
  status: string;
  created_at: string;
  users: { email: string | null; full_name: string | null } | null;
}

export interface VerificationHistoryRow {
  id: string;
  legal_name: string;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  users: { email: string | null; full_name: string | null } | null;
}

interface DocUrl { doc_type: string; url: string }

const STATUS_BADGE: Record<string, string> = {
  verified: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
};

export function AdminVerifications({
  initial,
  history,
}: {
  initial: VerificationRow[];
  history: VerificationHistoryRow[];
}) {
  const [rows, setRows] = useState<VerificationRow[]>(initial);
  const [log, setLog] = useState<VerificationHistoryRow[]>(history);
  const [openId, setOpenId] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocUrl[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const viewDocs = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setDocs([]);
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/admin/verifications?requestId=${id}`);
      const json = await res.json().catch(() => ({}));
      setDocs(json.documents ?? []);
    } finally {
      setLoadingDocs(false);
    }
  };

  const decide = async (row: VerificationRow, action: 'approve' | 'reject') => {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: row.id, action, reason: action === 'reject' ? reason : null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? 'Xatolik'); return; }
      // Move the decided request into the history log.
      setRows((r) => r.filter((x) => x.id !== row.id));
      setLog((l) => [
        {
          id: row.id,
          legal_name: row.legal_name,
          status: action === 'approve' ? 'verified' : 'rejected',
          rejection_reason: action === 'reject' ? reason || null : null,
          reviewed_at: new Date().toISOString(),
          created_at: row.created_at,
          users: row.users,
        },
        ...l,
      ]);
      setOpenId(null);
      setReason('');
      toast.success(action === 'approve' ? 'Tasdiqlandi' : 'Rad etildi');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-10">
      {/* ── Pending review ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Ko&apos;rib chiqilmoqda {rows.length > 0 && <span className="text-gray-400">({rows.length})</span>}
        </h2>

        {rows.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">Yangi so&apos;rovlar yo&apos;q</div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => {
              const open = openId === r.id;
              const busy = busyId === r.id;
              return (
                <div key={r.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white">{r.legal_name}</p>
                      <p className="text-xs text-gray-400">{r.users?.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                      <p className="text-xs text-gray-500 mt-1">🎂 {r.date_of_birth} · 📍 {r.address}</p>
                    </div>
                    <button onClick={() => viewDocs(r.id)} className="btn-ghost text-xs gap-1 border border-gray-200 dark:border-gray-700">
                      <Eye className="w-4 h-4" /> Hujjatlar
                    </button>
                  </div>

                  {open && (
                    <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                      {loadingDocs ? (
                        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                          {docs.map((d) => (
                            <a key={d.doc_type} href={d.url} target="_blank" rel="noopener noreferrer" className="block">
                              <span className="text-xs text-gray-400">{d.doc_type}</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={d.url} alt={d.doc_type} className="w-full h-28 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                            </a>
                          ))}
                          {docs.length === 0 && <p className="text-sm text-gray-400 col-span-full">Hujjatlar topilmadi</p>}
                        </div>
                      )}

                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Rad etish sababi (ixtiyoriy)"
                        className="input mb-3"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => decide(r, 'approve')} disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 flex-1 px-3 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-semibold text-sm hover:bg-green-100 disabled:opacity-50">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Tasdiqlash
                        </button>
                        <button onClick={() => decide(r, 'reject')} disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 flex-1 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-semibold text-sm hover:bg-red-100 disabled:opacity-50">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Rad etish
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── History ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Tasdiqlash tarixi</h2>
        {log.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">Tarix bo&apos;sh</div>
        ) : (
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            {log.map((h) => (
              <div key={h.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{h.legal_name}</p>
                  <p className="text-xs text-gray-400 truncate">{h.users?.email}</p>
                  {h.status === 'rejected' && h.rejection_reason && (
                    <p className="text-xs text-red-500 truncate mt-0.5">{h.rejection_reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`badge ${STATUS_BADGE[h.status] ?? ''}`}>{h.status}</span>
                  <p className="text-xs text-gray-400 mt-1">
                    {h.reviewed_at ? new Date(h.reviewed_at).toLocaleDateString('uz-UZ') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
