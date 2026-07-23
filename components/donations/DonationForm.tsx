'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, X, CreditCard } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Turnstile, isTurnstileEnabled, type TurnstileHandle } from '@/components/security/Turnstile';
import { useI18n } from '@/components/i18n/I18nProvider';
import dynamic from 'next/dynamic';
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector';
import { CHOICE_CHECKOUT, type SavedCardDisplay } from '@/components/payments/saved-card-constants';
import type { PaymentProviderOption, PaymentSubmethod } from '@/lib/payments/providers-meta';

// Lazy — the saved-card chooser is a separate chunk fetched ONLY when the feature
// is on AND the user has saved cards. With NEXT_PUBLIC_CLICK_SAVED_CARDS off it is
// never rendered, so the chunk is never loaded → not in the Checkout JS bundle.
const SavedCardSelector = dynamic(
  () => import('@/components/payments/SavedCardSelector').then((m) => m.SavedCardSelector),
  { ssr: false }
);

const PRESET_AMOUNTS = [10_000, 50_000, 100_000, 500_000];

// Client gate for the OPTIONAL saved-cards UI (server routes enforce the real
// config). Off by default → zero change to the donation form.
const SAVED_CARDS_UI = process.env.NEXT_PUBLIC_CLICK_SAVED_CARDS === '1';

// Two donor-display modes. ('first' is retired from the UI but still honoured in
// the DB/view for historical rows — see supabase/guest-donations.sql.)
type NameDisplay = 'full' | 'anonymous';

const schema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'Miqdor kiriting' })
    .min(1_000, 'Minimal xayriya miqdori 1,000 so\'m'),
  message: z.string().max(300).optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

interface DonationFormProps {
  campaignId: string;
  onClose: () => void;
  /** Server-resolved provider catalog (enabled + coming-soon). Empty → manual fallback. */
  providers?: PaymentProviderOption[];
}

/**
 * Donation form for BOTH guests and registered users. Guests provide name +
 * email (+ optional phone) and pass Turnstile; logged-in donors reuse their
 * profile (the API links via donor_id) and skip those fields. Everyone picks a
 * name-display option. The server creates the (pending) record — the client can
 * never set payment status.
 */
export function DonationForm({ campaignId, onClose, providers = [] }: DonationFormProps) {
  const { t } = useI18n();
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  // Pre-select the default (recommended) gateway, else the first enabled one;
  // null = manual (record-only) fallback when no gateway is live.
  const [method, setMethod] = useState<string | null>(
    (providers.find((p) => p.recommended && p.enabled) ?? providers.find((p) => p.enabled))?.id ?? null
  );
  const [submethod, setSubmethod] = useState<PaymentSubmethod>('wallet');
  const selectedProvider = providers.find((p) => p.id === method) ?? null;
  const [isGuest, setIsGuest] = useState<boolean | null>(null); // null = still resolving
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>('full');
  // Guests only identify themselves when donating under their name. Anonymous
  // donors give nothing — the fields are hidden AND never validated/sent.
  const needsContact = isGuest === true && nameDisplay === 'full';
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // ── Saved cards (optional, authenticated only). Additive to Checkout JS. ──
  const [savedCards, setSavedCards] = useState<SavedCardDisplay[] | null>(null);
  const [choice, setChoice] = useState<string>(CHOICE_CHECKOUT);
  const [paying, setPaying] = useState(false);
  const hasSavedCards = (savedCards?.length ?? 0) > 0;
  // Surface the chooser only when the user actually has saved cards. Cards are
  // saved automatically after a successful donation — there is no "add a card"
  // option — so a user with none sees exactly today's Click card payment flow.
  const showSavedUi = isGuest === false && SAVED_CARDS_UI && hasSavedCards;
  const payMode: 'checkout' | 'saved' = !showSavedUi
    ? 'checkout'
    : choice === CHOICE_CHECKOUT
    ? 'checkout'
    : 'saved';

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (active) setIsGuest(!user);
    });
    return () => { active = false; };
  }, []);

  // Load the user's saved cards once we know they're authenticated + the flag is on.
  const refreshCards = async () => {
    try {
      const json = await (await fetch('/api/account/cards')).json();
      return (json.cards ?? []) as SavedCardDisplay[];
    } catch {
      return [] as SavedCardDisplay[];
    }
  };
  useEffect(() => {
    if (isGuest !== false || !SAVED_CARDS_UI) return;
    let active = true;
    refreshCards().then((cards) => {
      if (!active) return;
      setSavedCards(cards);
      const def = cards.find((c) => c.is_default) ?? cards[0];
      if (def) setChoice(def.id); // default to the saved card; else stays on Checkout JS
    });
    return () => { active = false; };
  }, [isGuest]);

  // Saved-card / newly-added-card donation: create the pending donation, then
  // charge the token. Converges on the SAME confirmDonation() via the server.
  const payWithSavedCard = async (cardId: string) => {
    const amount = Math.floor(Number(getValues('amount')));
    if (!amount || amount < 1000) { toast.error(t('toasts.generic')); return; }
    setPaying(true);
    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId, amount, method: 'click',
          message: getValues('message') || null,
          anonymous: nameDisplay === 'anonymous', name_display: nameDisplay,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.donationId) { toast.error(t('toasts.generic')); return; }

      const pay = await fetch('/api/payments/click/card-token/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donationId: json.donationId, savedCardId: cardId }),
      });
      const pj = await pay.json().catch(() => ({}));
      // Charge accepted — the donation is finalised by the SHOP API Complete
      // callback (like Checkout JS). Hand off to the success page, which POLLS
      // until the callback confirms; never show completed immediately.
      if (pay.ok && pj.status === 'accepted') {
        window.location.href = `/payment/success?ref=${encodeURIComponent(json.reference)}`;
        return;
      }
      // Dead token → drop it and fall back to Checkout JS; else let them retry /
      // choose another card / use another card. A saved-card failure NEVER blocks.
      if (pj.invalidToken) {
        toast.error(t('cards.tokenExpired'));
        setSavedCards(await refreshCards());
        setChoice(CHOICE_CHECKOUT);
        return;
      }
      toast.error(t('cards.payFailed'));
    } finally {
      setPaying(false);
    }
  };

  const pickPreset = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmount('');
    setValue('amount', amount, { shouldValidate: true });
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmount(val);
    setSelectedPreset(null);
    setValue('amount', Number(val), { shouldValidate: true });
  };

  const onSubmit = async (data: FormData) => {
    // Saved-card path: separate flow, same confirmDonation() server-side. The
    // Checkout JS branch below is unchanged.
    if (payMode === 'saved') { await payWithSavedCard(choice); return; }

    // Only validate what is actually shown — hidden fields never error.
    if (needsContact) {
      if (donorName.trim().length < 2) { toast.error(t('toasts.donorNameRequired')); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail.trim())) { toast.error(t('toasts.donorEmailInvalid')); return; }
    }
    // Bot protection applies to every guest, named or anonymous.
    if (isGuest && isTurnstileEnabled() && !captchaToken) {
      toast.error(t('toasts.turnstile'));
      return;
    }
    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          amount: data.amount,
          method,
          // The in-provider choice (e.g. CLICK app vs bank card) travels with
          // the provider — it is never a separate provider.
          submethod: selectedProvider && selectedProvider.methods.length > 1 ? submethod : undefined,
          message: data.message || null,
          anonymous: nameDisplay === 'anonymous',
          name_display: nameDisplay,
          // Contact travels only when the donor chose to be named. Anonymous
          // guests send nothing identifying (the server enforces this too).
          ...(needsContact
            ? { donor_name: donorName.trim(), donor_email: donorEmail.trim() }
            : {}),
          ...(isGuest ? { turnstileToken: captchaToken } : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ? `${t('toasts.errorLabel')}: ${json.error}` : t('toasts.generic'));
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }
      // Click payment = a full-page REDIRECT to Click's hosted checkout — the
      // proven, last-known-working flow. We deliberately DO NOT open Click in an
      // in-page window / iframe: my.click.uz refuses to be framed ("the site
      // my.click.uz does not allow the connection"), which broke card payments on
      // desktop and mobile. The donation row is 'pending' and is credited ONLY by
      // the verified server-side callback (confirmDonation) — unchanged.
      if (json.redirectUrl) { window.location.href = json.redirectUrl; return; }
      toast.success(json.instructions || t('toasts.donationThanks'));
      onClose();
    } catch {
      toast.error(t('toasts.unexpected'));
    }
  };

  const radio = (value: NameDisplay, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 min-h-[40px]">
      <input type="radio" name="name_display" checked={nameDisplay === value} onChange={() => setNameDisplay(value)} className="w-4 h-4 accent-brand-600" />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Xayriya miqdori</h3>
        <button type="button" onClick={onClose} className="btn-ghost p-2" aria-label="Yopish">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Preset amounts */}
        <div className="grid grid-cols-2 gap-2">
          {PRESET_AMOUNTS.map((amt) => (
            <button key={amt} type="button" onClick={() => pickPreset(amt)}
              className={`min-h-[48px] py-3 px-3 rounded-xl border text-sm font-semibold transition-all active:scale-[0.98] ${
                selectedPreset === amt
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-700'
              }`}>
              {formatMoney(amt)} so&apos;m
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div>
          <label className="label">Boshqa miqdor (so&apos;m)</label>
          <input type="number" inputMode="numeric" value={customAmount} onChange={handleCustomChange} className="input" placeholder="Miqdorni kiriting" min={1000} />
          {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
        </div>

        {/* How the donor appears — drives which fields are shown below. */}
        <div>
          <label className="label">Xayriyani qanday qilasiz?</label>
          <div className="space-y-1">
            {radio('full', isGuest === false ? 'Profil ismim bilan' : 'Ismim bilan')}
            {radio('anonymous', 'Anonim xayriya qilish')}
          </div>
        </div>

        {/* Guest contact — shown ONLY when donating under a name. Logged-in
            donors reuse their profile, anonymous donors give nothing. */}
        {needsContact && (
          <div className="space-y-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
            <div>
              <label className="label">To&apos;liq ism</label>
              <input className="input" value={donorName} onChange={(e) => setDonorName(e.target.value)} autoComplete="name" placeholder="Ism Familiya" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} autoComplete="email" placeholder="email@example.com" />
              <p className="text-xs text-gray-400 mt-1">Kvitansiya va to&apos;lov tasdig&apos;i shu manzilga yuboriladi.</p>
            </div>
          </div>
        )}

        {isGuest && nameDisplay === 'anonymous' && (
          <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2">
            Xayriyangiz kampaniya sahifasida <strong>Anonim xayriyachi</strong> sifatida ko&apos;rinadi. Ism va email talab qilinmaydi.
          </p>
        )}

        {/* Payment method. For authenticated users with the saved-cards flag on,
            show the saved-card chooser; "Use another card" reveals the UNCHANGED
            Checkout JS selector. Guests / flag-off see exactly today's UI. */}
        {showSavedUi ? (
          <div className="space-y-3">
            <SavedCardSelector cards={savedCards ?? []} choice={choice} onChoice={setChoice} />
            {payMode === 'checkout' && (
              <PaymentMethodSelector
                providers={providers}
                selected={method}
                onSelect={setMethod}
                submethod={submethod}
                onSubmethod={setSubmethod}
              />
            )}
          </div>
        ) : (
          <PaymentMethodSelector
            providers={providers}
            selected={method}
            onSelect={setMethod}
            submethod={submethod}
            onSubmethod={setSubmethod}
          />
        )}

        {/* Message */}
        <div>
          <label className="label">Xabar (ixtiyoriy)</label>
          <textarea {...register('message')} rows={2} className="input resize-none" placeholder="Kampaniya uchun tilaklaringizni yozing..." />
        </div>

        {/* Turnstile (guests) */}
        {isGuest && <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} className="flex justify-center" />}

        {/* Payment notice — the redirect note applies only to the Checkout JS path. */}
        {payMode === 'checkout' && (
          <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 leading-relaxed flex items-start gap-2">
            <CreditCard className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {selectedProvider
                ? `Davom etsangiz, xavfsiz to'lov uchun ${selectedProvider.name} sahifasiga yo'naltirilasiz.`
                : "To'lov tizimi tez orada ulanadi. Xayriyangiz qayd etiladi va siz bilan bog'laniladi."}
            </span>
          </p>
        )}

        <button type="submit" disabled={isSubmitting || paying || isGuest === null} className="btn-primary w-full py-4 min-h-[56px] text-base">
          {isSubmitting || paying
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {payMode === 'saved' ? t('cards.paying') : selectedProvider ? "Yo'naltirilmoqda..." : 'Saqlanmoqda...'}</>
            : payMode === 'saved' ? t('cards.donateWithCard') : selectedProvider ? `${selectedProvider.name} bilan davom etish` : 'Xayriya qilish'}
        </button>
      </form>
    </div>
  );
}
