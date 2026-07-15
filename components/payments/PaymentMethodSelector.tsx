'use client';

import { Smartphone, CreditCard, Check, Lock, BadgeCheck, Zap } from 'lucide-react';
import type { PaymentProviderOption, PaymentSubmethod } from '@/lib/payments/providers-meta';

// ── Per-provider premium presentation copy (keyed by provider id) ────────────
// Kept as data so the premium card is provider-driven: when a future provider
// is enabled in the registry, add an entry here and it renders the same premium
// treatment — no structural redesign. Only enabled providers are shown.
interface ProviderPresentation {
  tagline: string;
  blurb: string;
  benefits: string[];
}
const PROVIDER_PRESENTATION: Record<string, ProviderPresentation> = {
  click: {
    tagline: 'Tez • Xavfsiz • Ishonchli',
    blurb: "CLICK yoki istalgan UzCard/Humo bank kartasi orqali xavfsiz to'lang.",
    benefits: ['Tezkor tasdiqlash', "Xavfsiz to'lov", "UzCard va Humo qo'llab-quvvatlanadi"],
  },
};

const SUBMETHOD_COPY: Record<PaymentSubmethod, { title: string; text: string; Icon: typeof Smartphone }> = {
  wallet: {
    title: "CLICK orqali to'lash",
    text: "CLICK ilovasi bor foydalanuvchilar uchun tavsiya etiladi.",
    Icon: Smartphone,
  },
  card: {
    title: 'Bank kartasi orqali',
    text: "CLICK hisobisiz UzCard yoki Humo kartasi orqali xavfsiz to'lang.",
    Icon: CreditCard,
  },
};

// Inline CLICK wordmark (nominative use — labelling the payment method, like a
// checkout showing Visa/Mastercard). Flat, crisp at any size, no external load
// (CSP-safe). Fallbacks to the metadata initial chip for other providers.
function ProviderLogo({ provider }: { provider: PaymentProviderOption }) {
  if (provider.id === 'click') {
    return (
      <svg
        viewBox="0 0 132 48"
        role="img"
        aria-label="CLICK"
        className="h-11 w-auto"
      >
        <rect width="132" height="48" rx="12" fill="#0098CB" />
        <text
          x="66"
          y="32"
          textAnchor="middle"
          fontFamily="var(--font-inter), system-ui, sans-serif"
          fontSize="25"
          fontWeight="800"
          letterSpacing="0.5"
          fill="#ffffff"
        >
          click
        </text>
      </svg>
    );
  }
  return (
    <span
      aria-label={provider.name}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black ${provider.logo.className}`}
    >
      {provider.logo.initial}
    </span>
  );
}

interface PaymentMethodSelectorProps {
  /** Server-resolved provider availability (single source of truth). */
  providers: PaymentProviderOption[];
  selected: string | null;
  onSelect: (id: string) => void;
  submethod: PaymentSubmethod;
  onSubmethod: (m: PaymentSubmethod) => void;
}

/**
 * Payment method section. Renders a large, premium card per ENABLED provider
 * (Coming-Soon / unimplemented providers are intentionally not shown — they
 * still live in the registry and reappear here automatically once enabled). A
 * provider's own payment options (CLICK app vs bank card) are sub-options INSIDE
 * its card — never separate providers. A trust row sits below.
 */
export function PaymentMethodSelector({
  providers,
  selected,
  onSelect,
  submethod,
  onSubmethod,
}: PaymentMethodSelectorProps) {
  const available = providers.filter((p) => p.enabled);
  if (available.length === 0) return null;

  return (
    <section aria-labelledby="pay-method-heading">
      <h4 id="pay-method-heading" className="font-bold text-gray-900 dark:text-white text-sm">
        To&apos;lov usuli
      </h4>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">
        Xavfsiz to&apos;lov tizimi orqali xayriya qiling.
      </p>

      <div role="radiogroup" aria-label="To'lov tizimi" className="space-y-3">
        {available.map((p) => {
          const isSelected = selected === p.id;
          const pres = PROVIDER_PRESENTATION[p.id];
          const multi = p.methods.length > 1;
          return (
            <div
              key={p.id}
              className={`rounded-3xl border bg-white dark:bg-gray-900 shadow-card-md transition-all ${
                isSelected
                  ? 'border-sky-300 dark:border-sky-800 ring-1 ring-sky-300 dark:ring-sky-800'
                  : 'border-gray-200 dark:border-gray-800 hover:border-sky-200 dark:hover:border-sky-900'
              }`}
            >
              {/* Provider header — selectable (scales to multiple providers) */}
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${p.name} — ${pres?.tagline ?? ''}`}
                onClick={() => onSelect(p.id)}
                className="w-full text-left p-5 sm:p-6 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <div className="flex items-start gap-4">
                  <ProviderLogo provider={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black text-gray-900 dark:text-white tracking-tight">
                        {p.name}
                      </span>
                      {p.recommended && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300">
                          Tavsiya etiladi
                        </span>
                      )}
                    </div>
                    {pres?.tagline && (
                      <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 mt-0.5">
                        {pres.tagline}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </div>

                {pres?.blurb && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 leading-relaxed">
                    {pres.blurb}
                  </p>
                )}

                {pres?.benefits && pres.benefits.length > 0 && (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                    {pres.benefits.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </button>

              {/* Sub-options — belong to the provider, shown inside its card */}
              {isSelected && multi && (
                <div className="px-5 pb-5 sm:px-6 sm:pb-6 -mt-1">
                  <div className="h-px bg-gray-100 dark:bg-gray-800 mb-4" />
                  <div role="radiogroup" aria-label={`${p.name} to'lov turi`} className="space-y-2.5">
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
                          className={`w-full min-h-[64px] flex items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                            active
                              ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30'
                              : 'border-gray-200 dark:border-gray-700 hover:border-sky-300 dark:hover:border-sky-800'
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              active
                                ? 'bg-sky-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            <c.Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-bold ${active ? 'text-sky-800 dark:text-sky-300' : 'text-gray-900 dark:text-white'}`}>
                              {c.title}
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.text}</span>
                          </span>
                          <span
                            aria-hidden
                            className={`shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                              active ? 'border-sky-600 bg-sky-600' : 'border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {active && <Check className="h-3 w-3 text-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Trust row */}
      <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400">
        <li className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden />
          <span>SSL shifrlash bilan himoyalangan</span>
        </li>
        <li className="inline-flex items-center gap-1.5">
          <BadgeCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden />
          <span>Rasmiy CLICK hamkori</span>
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden />
          <span>Tezkor to&apos;lov tasdig&apos;i</span>
        </li>
      </ul>
    </section>
  );
}
