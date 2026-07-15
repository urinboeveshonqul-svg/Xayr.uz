'use client';

import type { PaymentProviderOption, PaymentSubmethod } from '@/lib/payments/providers-meta';

/**
 * Official CLICK logo — the rounded-diamond mark (brand blue) with its inner
 * cut-out, plus the `click` wordmark. Reproduced as inline SVG so it stays
 * crisp at any size, needs no network request (CSP-safe) and adapts to dark
 * mode: the wordmark inherits `currentColor` and the mark's cut-out matches the
 * card surface, exactly like a real knock-out.
 */
function ClickLogo() {
  return (
    <svg
      viewBox="0 0 340 120"
      role="img"
      aria-label="CLICK"
      className="h-8 sm:h-9 w-auto text-gray-900 dark:text-white"
    >
      <rect x="20" y="20" width="80" height="80" rx="26" transform="rotate(45 60 60)" fill="#0066FF" />
      <rect
        x="47"
        y="47"
        width="26"
        height="26"
        rx="8"
        transform="rotate(45 60 60)"
        className="fill-white dark:fill-gray-900"
      />
      <text
        x="128"
        y="84"
        fontFamily="var(--font-inter), system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontSize="76"
        fontWeight="800"
        letterSpacing="-3"
        fill="currentColor"
      >
        click
      </text>
    </svg>
  );
}

function ProviderLogo({ provider }: { provider: PaymentProviderOption }) {
  if (provider.id === 'click') return <ClickLogo />;
  return (
    <span
      aria-label={provider.name}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-base font-black ${provider.logo.className}`}
    >
      {provider.logo.initial}
    </span>
  );
}

/** Copy for a provider's in-house payment options. Derived from the provider so
 *  a future gateway reuses it without a redesign. */
function submethodCopy(providerName: string, m: PaymentSubmethod) {
  return m === 'wallet'
    ? {
        title: `${providerName} ilovasi`,
        text: `${providerName} ilovasi bor foydalanuvchilar uchun tavsiya etiladi.`,
      }
    : {
        title: 'Bank kartasi',
        text: "Istalgan UzCard yoki Humo bank kartasi orqali to'lang.",
      };
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
 * Payment method section — deliberately flat: title, provider logo, one line of
 * reassurance, then the provider's payment options as plain radios. No nested
 * cards, badges, checklists or trust rows.
 *
 * Each radio carries BOTH the provider and its option, so picking "Bank card"
 * selects the gateway and the option in one tap. Only enabled providers render
 * (Coming-Soon ones stay in the registry and reappear once enabled).
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
    <section aria-labelledby="pay-method-heading" className="pt-1">
      <h4 id="pay-method-heading" className="label mb-3">
        To&apos;lov usuli
      </h4>

      {available.map((p) => (
        <div key={p.id} className="space-y-5">
          <div className="space-y-2">
            <ProviderLogo provider={p} />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {p.name} orqali xavfsiz to&apos;lovlar.
            </p>
          </div>

          <div role="radiogroup" aria-label={`${p.name} to'lov usuli`} className="space-y-3">
            {p.methods.map((m) => {
              const active = selected === p.id && submethod === m;
              const c = submethodCopy(p.name, m);
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    onSelect(p.id);
                    onSubmethod(m);
                  }}
                  className={`w-full min-h-[64px] flex items-start gap-3.5 rounded-2xl border px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    active
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      active ? 'border-brand-600' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-bold ${
                        active ? 'text-brand-700 dark:text-brand-400' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {c.title}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      {c.text}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
