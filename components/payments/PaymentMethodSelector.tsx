'use client';

import { Smartphone, CreditCard, Check } from 'lucide-react';
import type { PaymentProviderOption, PaymentSubmethod } from '@/lib/payments/providers-meta';

// Donor-facing taglines (this form's language is Uzbek, matching DonationForm).
const TAGLINES: Record<string, string> = {
  click: "Tez va xavfsiz to'lovlar",
  payme: 'Tez kunda ulanadi',
  paynet: 'Tez kunda ulanadi',
  uzum: 'Tez kunda ulanadi',
};

const SUBMETHOD_COPY: Record<PaymentSubmethod, { title: string; text: string; Icon: typeof Smartphone }> = {
  wallet: {
    title: "CLICK orqali to'lash",
    text: "CLICK hisobingiz orqali tez to'lang. CLICK ilovasi bor foydalanuvchilar uchun tavsiya etiladi.",
    Icon: Smartphone,
  },
  card: {
    title: 'Bank kartasi orqali',
    text: "Istalgan UzCard yoki Humo kartasi orqali xavfsiz to'lang. CLICK hisobi shart emas.",
    Icon: CreditCard,
  },
};

interface PaymentMethodSelectorProps {
  /** Server-resolved provider availability (single source of truth). */
  providers: PaymentProviderOption[];
  selected: string | null;
  onSelect: (id: string) => void;
  submethod: PaymentSubmethod;
  onSubmethod: (m: PaymentSubmethod) => void;
}

/**
 * Provider selection card list — enabled providers are selectable; planned
 * ones stay visible with a "Coming Soon" badge (never hidden, never selectable).
 * A provider's own payment choices (e.g. CLICK app vs bank card) render INSIDE
 * its card as sub-options, not as separate providers.
 */
export function PaymentMethodSelector({
  providers,
  selected,
  onSelect,
  submethod,
  onSubmethod,
}: PaymentMethodSelectorProps) {
  if (providers.length === 0) return null;

  return (
    <div>
      <h4 className="font-bold text-gray-900 dark:text-white text-sm">To&apos;lov usulini tanlang</h4>
      <p className="text-xs text-gray-400 mt-0.5 mb-2">Sizga qulay to&apos;lov usulini tanlang.</p>

      <div role="radiogroup" aria-label="To'lov usuli" className="space-y-2">
        {providers.map((p) => {
          const isSelected = selected === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-xl border transition-all ${
                isSelected
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : p.enabled
                    ? 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
                    : 'border-gray-200 dark:border-gray-800 opacity-60'
              }`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!p.enabled}
                disabled={!p.enabled}
                onClick={() => p.enabled && onSelect(p.id)}
                className={`w-full min-h-[56px] flex items-center gap-3 px-3 py-3 text-left rounded-xl ${
                  p.enabled ? 'active:scale-[0.99]' : 'cursor-not-allowed'
                }`}
              >
                <span
                  aria-hidden
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0 ${
                    p.enabled ? p.logo.className : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  }`}
                >
                  {p.logo.initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold ${isSelected ? 'text-brand-700 dark:text-brand-400' : 'text-gray-900 dark:text-white'}`}>
                      {p.name}
                    </span>
                    {p.recommended && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400">
                        Tavsiya etiladi
                      </span>
                    )}
                    {p.comingSoon && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500">
                        Tez kunda
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">{TAGLINES[p.id] ?? ''}</span>
                </span>
                {isSelected && <Check className="w-5 h-5 text-brand-600 flex-shrink-0" aria-hidden />}
              </button>

              {/* Sub-options belong to the provider — shown inside its selected card. */}
              {isSelected && p.methods.length > 1 && (
                <div role="radiogroup" aria-label={`${p.name} to'lov turi`} className="px-3 pb-3 space-y-2">
                  {p.methods.map((m) => {
                    const c = SUBMETHOD_COPY[m];
                    const active = submethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onSubmethod(m)}
                        className={`w-full min-h-[48px] flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left bg-white dark:bg-gray-900 transition-all active:scale-[0.99] ${
                          active
                            ? 'border-brand-500 ring-1 ring-brand-500'
                            : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
                        }`}
                      >
                        <c.Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
                        <span className="min-w-0">
                          <span className={`block text-sm font-bold ${active ? 'text-brand-700 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {c.title}
                          </span>
                          <span className="block text-xs text-gray-400 mt-0.5">{c.text}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
