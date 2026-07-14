'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, BadgeCheck, CircleOff, Clock3, Loader2, Star } from 'lucide-react';
import type { PaymentCatalogEntry } from '@/lib/payments/catalog';

/**
 * Admin control panel for the payment provider catalog. Every change is a
 * configuration write (payment_provider_settings) — no code changes needed.
 * Live availability additionally requires the provider implementation +
 * merchant credentials; the status column shows exactly what's missing.
 */
export function AdminPaymentProviders({ initial }: { initial: PaymentCatalogEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (
    id: string,
    changes: Record<string, unknown>,
    optimistic: (r: PaymentCatalogEntry) => PaymentCatalogEntry,
    silent = false
  ) => {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/payment-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error === 'Could not update settings'
          ? "Saqlanmadi — payment_provider_settings jadvali mavjudligini tekshiring (migratsiya #47)."
          : "Saqlanmadi. Qayta urinib ko'ring.");
        return false;
      }
      setRows((rs) => rs.map((r) => (r.id === id ? optimistic(r) : r)));
      if (!silent) toast.success('Saqlandi');
      return true;
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = (r: PaymentCatalogEntry) =>
    patch(r.id, { enabled: !r.adminEnabled }, (x) => resolve({ ...x, adminEnabled: !r.adminEnabled }));

  const toggleComingSoon = (r: PaymentCatalogEntry) =>
    patch(r.id, { coming_soon: !r.adminComingSoon }, (x) => resolve({ ...x, adminComingSoon: !r.adminComingSoon }));

  const setDefault = async (r: PaymentCatalogEntry) => {
    const ok = await patch(r.id, { is_default: true }, (x) => x, true);
    if (ok) {
      setRows((rs) => rs.map((x) => resolve({ ...x, recommended: x.id === r.id })));
      toast.success('Saqlandi');
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = rows[index];
    const b = rows[index + dir];
    if (!a || !b) return;
    // Swap priorities (two config writes), then re-sort locally.
    const okA = await patch(a.id, { priority: b.priority }, (x) => ({ ...x, priority: b.priority }), true);
    if (!okA) return;
    const okB = await patch(b.id, { priority: a.priority }, (x) => ({ ...x, priority: a.priority }), true);
    if (!okB) return;
    setRows((rs) => [...rs].sort((x, y) => x.priority - y.priority || x.name.localeCompare(y.name)));
    toast.success('Saqlandi');
  };

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Identity */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0 ${r.logo.className}`}>
              {r.logo.initial}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                {r.name}
                {r.recommended && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400">
                    Standart
                  </span>
                )}
              </p>
              <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                {r.enabled ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><BadgeCheck className="w-3.5 h-3.5" /> Faol</span>
                ) : r.comingSoon ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><Clock3 className="w-3.5 h-3.5" /> Tez kunda</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-400 font-semibold"><CircleOff className="w-3.5 h-3.5" /> Yashirin</span>
                )}
                {!r.implemented && <span className="text-gray-400">· integratsiya kodi yo&apos;q</span>}
                {r.implemented && !r.configured && <span className="text-gray-400">· merchant sozlamalari (env) yo&apos;q</span>}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => toggleEnabled(r)}
              disabled={busy === r.id}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-all ${
                r.adminEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-emerald-300'
              }`}
            >
              {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : r.adminEnabled ? 'Yoqilgan' : "O'chirilgan"}
            </button>
            <button
              type="button"
              onClick={() => toggleComingSoon(r)}
              disabled={busy === r.id}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-all ${
                r.adminComingSoon
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-amber-300'
              }`}
            >
              Tez kunda
            </button>
            <button
              type="button"
              onClick={() => setDefault(r)}
              disabled={busy === r.id || r.recommended || !r.enabled}
              title={r.enabled ? 'Standart qilish' : 'Faqat faol tizim standart bo\'la oladi'}
              className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-brand-300 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <Star className={`w-3.5 h-3.5 ${r.recommended ? 'fill-brand-500 text-brand-500' : ''}`} /> Standart
            </button>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busy !== null} aria-label={`${r.name} yuqoriga`}
                className="p-2 min-h-[40px] min-w-[40px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-brand-300 disabled:opacity-40">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy !== null} aria-label={`${r.name} pastga`}
                className="p-2 min-h-[40px] min-w-[40px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-brand-300 disabled:opacity-40">
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-400 leading-relaxed">
        Tizim faqat <strong>Yoqilgan</strong> + <strong>Tez kunda emas</strong> + integratsiya kodi va merchant
        sozlamalari mavjud bo&apos;lganda xayriyachilarga faol ko&apos;rinadi. <strong>Tez kunda</strong> — kartochka
        ko&apos;rinadi, lekin tanlab bo&apos;lmaydi. <strong>O&apos;chirilgan</strong> (Tez kundasiz) — umuman ko&apos;rinmaydi.
      </p>
    </div>
  );
}

/** Recompute the resolved flags after an admin change (mirrors lib/payments/catalog.ts). */
function resolve(r: PaymentCatalogEntry): PaymentCatalogEntry {
  const operational = r.implemented && r.configured;
  const enabled = r.adminEnabled && !r.adminComingSoon && operational;
  const comingSoon = !enabled && (r.adminComingSoon || (r.adminEnabled && !operational));
  return { ...r, enabled, comingSoon, recommended: r.recommended && enabled };
}
