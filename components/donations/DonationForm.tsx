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
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector';
import type { PaymentProviderOption, PaymentSubmethod } from '@/lib/payments/providers-meta';

const PRESET_AMOUNTS = [10_000, 50_000, 100_000, 500_000];

type NameDisplay = 'full' | 'first' | 'anonymous';

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
  const [donorPhone, setDonorPhone] = useState('');
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>('full');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (active) setIsGuest(!user);
    });
    return () => { active = false; };
  }, []);

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
    if (isGuest) {
      if (donorName.trim().length < 2) { toast.error("Ismingizni kiriting"); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail.trim())) { toast.error("Email manzilini to'g'ri kiriting"); return; }
      if (isTurnstileEnabled() && !captchaToken) {
        toast.error("Xavfsizlik tekshiruvidan o'ting. Qayta urinib ko'ring.");
        return;
      }
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
          ...(isGuest
            ? {
                donor_name: donorName.trim(),
                donor_email: donorEmail.trim(),
                donor_phone: donorPhone.trim() || null,
                turnstileToken: captchaToken,
              }
            : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ? `Xatolik: ${json.error}` : 'Xatolik yuz berdi');
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }
      if (json.redirectUrl) { window.location.href = json.redirectUrl; return; }
      toast.success(json.instructions || 'Xayriyangiz qabul qilindi!');
      onClose();
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    }
  };

  const radio = (value: NameDisplay, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
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

        {/* Payment method (amount → method → continue) */}
        <PaymentMethodSelector
          providers={providers}
          selected={method}
          onSelect={setMethod}
          submethod={submethod}
          onSubmethod={setSubmethod}
        />

        {/* Guest contact (logged-in donors reuse their profile) */}
        {isGuest && (
          <div className="space-y-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
            <div>
              <label className="label">To&apos;liq ism</label>
              <input className="input" value={donorName} onChange={(e) => setDonorName(e.target.value)} autoComplete="name" placeholder="Ism Familiya" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} autoComplete="email" placeholder="email@example.com" />
              <p className="text-xs text-gray-400 mt-1">Kvitansiya shu manzilga yuboriladi.</p>
            </div>
            <div>
              <label className="label">Telefon (ixtiyoriy)</label>
              <input className="input" type="tel" inputMode="tel" value={donorPhone} onChange={(e) => setDonorPhone(e.target.value)} autoComplete="tel" placeholder="+998 90 123 45 67" />
            </div>
          </div>
        )}

        {/* Name display */}
        <div>
          <label className="label">Ismingizni qanday ko&apos;rsatamiz?</label>
          <div className="space-y-1.5">
            {radio('full', 'Ismimni ko\'rsatish')}
            {radio('first', 'Faqat ismni ko\'rsatish')}
            {radio('anonymous', 'Anonim xayriya qilish')}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="label">Xabar (ixtiyoriy)</label>
          <textarea {...register('message')} rows={2} className="input resize-none" placeholder="Kampaniya uchun tilaklaringizni yozing..." />
        </div>

        {/* Turnstile (guests) */}
        {isGuest && <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} className="flex justify-center" />}

        {/* Payment notice */}
        <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 leading-relaxed flex items-start gap-2">
          <CreditCard className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {selectedProvider
              ? `Davom etsangiz, xavfsiz to'lov uchun ${selectedProvider.name} sahifasiga yo'naltirilasiz.`
              : "To'lov tizimi tez orada ulanadi. Xayriyangiz qayd etiladi va siz bilan bog'laniladi."}
          </span>
        </p>

        <button type="submit" disabled={isSubmitting || isGuest === null} className="btn-primary w-full py-3 min-h-[48px] text-base">
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {method ? "Yo'naltirilmoqda..." : 'Saqlanmoqda...'}</>
            : method ? "To'lovga o'tish" : 'Xayriya qilish'}
        </button>
      </form>
    </div>
  );
}
