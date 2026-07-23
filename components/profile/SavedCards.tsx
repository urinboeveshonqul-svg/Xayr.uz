'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Loader2, Star, Trash2 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { cardTypeLabel } from '@/lib/payout';
import type { SavedCardDisplay } from '@/components/payments/saved-card-constants';

interface Card extends SavedCardDisplay {
  is_default: boolean;
  card_holder?: string | null;
  last_used_at?: string | null;
}

/**
 * Account → Saved Cards: view · set default · delete. There is no "add" action —
 * cards are saved automatically after a successful donation
 * (lib/payments/save-card-token.ts); this page manages what's already saved.
 */
export function SavedCards() {
  const { t } = useI18n();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/account/cards');
      const json = await res.json().catch(() => ({ cards: [] }));
      setCards(json.cards ?? []);
    } catch { setCards([]); }
  };
  useEffect(() => { load(); }, []);

  const setDefault = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/account/cards/${id}/default`, { method: 'POST' });
      if (!res.ok) { toast.error(t('toasts.generic')); return; }
      await load();
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/account/cards/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(t('toasts.generic')); return; }
      toast.success(t('cards.removed'));
      await load();
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-900 dark:text-white">{t('cards.title')}</h2>
      </div>

      {cards === null ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">{t('cards.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <CreditCard className="w-5 h-5 text-brand-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {cardTypeLabel(c.card_brand)} •••• {c.last4}
                    {c.is_default && <span className="ml-2 text-[11px] font-bold text-brand-600">{t('cards.default')}</span>}
                  </p>
                  {c.card_holder && <p className="text-xs text-gray-400 truncate">{c.card_holder}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!c.is_default && (
                  <button onClick={() => setDefault(c.id)} disabled={busyId === c.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20" aria-label={t('cards.makeDefault')}>
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => remove(c.id)} disabled={busyId === c.id}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={t('cards.remove')}>
                  {busyId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
