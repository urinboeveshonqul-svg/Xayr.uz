'use client';

import { CreditCard, Plus, RefreshCw } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { cardTypeLabel } from '@/lib/payout';
import { CHOICE_ADD, CHOICE_CHECKOUT, type SavedCardDisplay } from '@/components/payments/saved-card-constants';

/**
 * Donation-form payment chooser for authenticated users when saved cards exist
 * (or can be added). A single radio group:
 *   • one row per saved card (default first),
 *   • "Add a new card and save it"   → CHOICE_ADD,
 *   • "Use another card"             → CHOICE_CHECKOUT (the existing Checkout JS).
 * Purely presentational — DonationForm maps the choice to a payment path.
 */
export function SavedCardSelector({
  cards,
  choice,
  onChoice,
}: {
  cards: SavedCardDisplay[];
  choice: string;
  onChoice: (c: string) => void;
}) {
  const { t } = useI18n();

  const row = (value: string, node: React.ReactNode, icon: React.ReactNode) => (
    <label
      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
        choice === value
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-brand-300'
      }`}
    >
      <input type="radio" name="pay_choice" checked={choice === value} onChange={() => onChoice(value)} className="w-4 h-4 accent-brand-600" />
      <span className="flex items-center gap-2 min-w-0 text-sm text-gray-800 dark:text-gray-200">{icon}{node}</span>
    </label>
  );

  return (
    <div className="space-y-2">
      {cards.length > 0 && (
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('cards.savedCards')}</p>
      )}
      {cards.map((c) =>
        row(
          c.id,
          <span className="truncate">
            {cardTypeLabel(c.card_brand)} •••• {c.last4}
            {c.is_default && <span className="ml-2 text-[11px] font-bold text-brand-600">{t('cards.default')}</span>}
          </span>,
          <CreditCard className="w-4 h-4 text-brand-600 flex-shrink-0" />
        )
      )}
      {row(CHOICE_ADD, <span>{t('cards.addAndSave')}</span>, <Plus className="w-4 h-4 text-brand-600 flex-shrink-0" />)}
      {row(CHOICE_CHECKOUT, <span>{t('cards.useAnother')}</span>, <RefreshCw className="w-4 h-4 text-gray-400 flex-shrink-0" />)}
    </div>
  );
}
