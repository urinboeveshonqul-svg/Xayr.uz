'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, CreditCard } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { UZ, nationalDigitsFrom, formatNational, isValidNational, toE164 } from '@/lib/phone';
import { CARD_TYPES, cardDigits, formatCard, isValidCard } from '@/lib/payout';
import type { PayoutAccount, CardType } from '@/types';

/**
 * Payout information. One payout account per user (upsert into payout_accounts;
 * RLS scopes to the owner). Lives inline on the withdrawal page; the request
 * snapshots it server-side. Never collects CVV/PIN/expiry.
 *
 * Reuse hooks:
 *   • embedded  — drop the standalone `card` chrome so it nests cleanly inside
 *                 the withdrawal section's panel.
 *   • onSaved   — called after a successful save (parent closes the editor).
 *   • onCancel  — when provided, renders a Cancel button (edit mode).
 */
export function PayoutAccountForm({
  userId,
  initial,
  embedded = false,
  onSaved,
  onCancel,
}: {
  userId: string;
  initial: PayoutAccount | null;
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();

  const [legalName, setLegalName] = useState(initial?.full_legal_name ?? '');
  const [phone, setPhone] = useState(initial ? nationalDigitsFrom(initial.phone_number) : '');
  const [cardType, setCardType] = useState<CardType>(initial?.card_type ?? 'uzcard');
  const [card, setCard] = useState(initial ? cardDigits(initial.card_number) : '');
  const [cardholder, setCardholder] = useState(initial?.cardholder_name ?? '');
  const [bank, setBank] = useState(initial?.bank_name ?? '');
  const [saving, setSaving] = useState(false);

  const valid =
    legalName.trim().length >= 3 &&
    isValidNational(phone) &&
    isValidCard(card) &&
    cardholder.trim().length >= 2;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      toast.error("Ma'lumotlarni to'g'ri to'ldiring");
      return;
    }
    setSaving(true);
    try {
      const { error } = await createClient()
        .from('payout_accounts')
        .upsert({
          user_id: userId,
          full_legal_name: legalName.trim(),
          phone_number: toE164(phone),
          card_type: cardType,
          card_number: cardDigits(card),
          cardholder_name: cardholder.trim(),
          bank_name: bank.trim() || null,
        });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("To'lov ma'lumotlari saqlandi");
      router.refresh();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? 'rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 sm:p-5' : 'card p-5 mb-6'}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-4 h-4 text-brand-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">To&apos;lov ma&apos;lumotlari</h2>
          <p className="text-xs text-gray-400">Mablag&apos; yechish uchun karta ma&apos;lumotlaringiz</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div>
          <RequiredLabel>To&apos;liq ism (rasmiy)</RequiredLabel>
          <input
            className="input"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Familiya Ism Sharif"
            autoComplete="name"
          />
        </div>

        <div>
          <RequiredLabel htmlFor="payout-phone">Telefon raqami</RequiredLabel>
          <div className="flex">
            <span
              className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-semibold select-none"
              aria-hidden
            >
              {UZ.dialCode}
            </span>
            <input
              id="payout-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="input rounded-l-none"
              value={formatNational(phone)}
              onChange={(e) => setPhone(nationalDigitsFrom(e.target.value))}
              placeholder={UZ.example}
            />
          </div>
        </div>

        <div>
          <RequiredLabel>Karta turi</RequiredLabel>
          <div className="grid grid-cols-2 gap-2">
            {CARD_TYPES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCardType(c.value)}
                className={`py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  cardType === c.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-brand-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <RequiredLabel htmlFor="payout-card">Karta raqami</RequiredLabel>
          <input
            id="payout-card"
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            className="input tracking-wider"
            value={formatCard(card)}
            onChange={(e) => setCard(cardDigits(e.target.value))}
            placeholder="8600 1234 5678 9012"
          />
          {card.length > 0 && !isValidCard(card) && (
            <p className="text-red-500 text-xs mt-1">16 ta raqam kiriting</p>
          )}
        </div>

        <div>
          <RequiredLabel>Karta egasi</RequiredLabel>
          <input
            className="input"
            value={cardholder}
            onChange={(e) => setCardholder(e.target.value)}
            placeholder="ISM FAMILIYA"
            autoComplete="cc-name"
          />
        </div>

        <div>
          <label className="label">Bank nomi (ixtiyoriy)</label>
          <input
            className="input"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="Masalan: Ipoteka Bank"
          />
        </div>

        <p className="text-xs text-gray-400">
          CVV, PIN yoki amal qilish muddati saqlanmaydi. Ma&apos;lumotlaringiz faqat sizga va
          to&apos;lovni amalga oshiruvchi adminga ko&apos;rinadi.
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-ghost w-full sm:w-auto px-6 py-2.5">
              Bekor qilish
            </button>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto px-6 py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Saqlash
          </button>
        </div>
      </form>
    </div>
  );
}
