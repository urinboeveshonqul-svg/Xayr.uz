'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { cardDigits, formatCard } from '@/lib/payout';
import type { SavedCardDisplay } from '@/components/payments/saved-card-constants';

// Re-export so existing imports (`from '.../AddCardFlow'`) keep working.
export type { SavedCardDisplay } from '@/components/payments/saved-card-constants';

/**
 * Two-step Click card enrollment — the ONE place card enrollment lives (shared by
 * the donation form and the Account → Saved Cards page):
 *   card details → POST /request (Click SMS-OTPs) → OTP → POST /verify (saves).
 * The PAN goes only to /request; the token is stored encrypted server-side and is
 * never returned here. Selecting this flow IS the consent to save (no extra box).
 */
export function AddCardFlow({
  makeDefault = false,
  onSaved,
  onCancel,
}: {
  makeDefault?: boolean;
  onSaved: (card: SavedCardDisplay) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<'card' | 'otp'>('card');
  const [pan, setPan] = useState('');
  const [expiry, setExpiry] = useState(''); // MMYY
  const [phone, setPhone] = useState('');
  const [holder, setHolder] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    const digits = cardDigits(pan);
    if (digits.length !== 16) { toast.error(t('cards.errCard')); return; }
    if (!/^\d{4}$/.test(expiry)) { toast.error(t('cards.errExpiry')); return; }
    if (phone.replace(/\D/g, '').length < 9) { toast.error(t('cards.errPhone')); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/account/cards/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: digits, expire_date: expiry, phone_number: phone.replace(/\D/g, '') }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t('cards.errRequest')); return; }
      setEnrollment(json.enrollment);
      setMaskedPhone(json.maskedPhone ?? '');
      setStep('otp');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (otp.trim().length < 3) { toast.error(t('cards.errOtp')); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/account/cards/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment, sms_code: otp.trim(), card_holder: holder.trim() || null, make_default: makeDefault }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t('cards.errOtpFailed')); return; }
      toast.success(t('cards.saved'));
      onSaved(json.card as SavedCardDisplay);
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
      <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <ShieldCheck className="w-4 h-4 text-brand-600 flex-shrink-0" /> {t('cards.secureNote')}
      </p>

      {step === 'card' ? (
        <>
          <div>
            <label className="label">{t('cards.cardNumber')}</label>
            <input className="input tracking-wider" inputMode="numeric" value={formatCard(pan)}
              onChange={(e) => setPan(cardDigits(e.target.value))} placeholder="8600 •••• •••• ••••" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('cards.expiry')}</label>
              <input className="input" inputMode="numeric" maxLength={4} value={expiry}
                onChange={(e) => setExpiry(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="MMYY" />
            </div>
            <div>
              <label className="label">{t('cards.phone')}</label>
              <input className="input" inputMode="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="+998 ..." />
            </div>
          </div>
          <div>
            <label className="label">{t('cards.holder')}</label>
            <input className="input" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder={t('cards.holderPlaceholder')} />
          </div>
          <div className="flex gap-2 justify-end">
            {onCancel && <button type="button" onClick={onCancel} className="btn-ghost px-4 py-2 text-sm">{t('ux.cancel')}</button>}
            <button type="button" onClick={requestOtp} disabled={busy} className="btn-primary px-4 py-2 text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {t('cards.getCode')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('cards.otpSent')} {maskedPhone}</p>
          <div>
            <label className="label">{t('cards.otp')}</label>
            <input className="input tracking-[0.3em] text-center" inputMode="numeric" value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" autoFocus />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setStep('card')} className="btn-ghost px-4 py-2 text-sm">{t('ux.back')}</button>
            <button type="button" onClick={confirm} disabled={busy} className="btn-primary px-4 py-2 text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {t('cards.confirmSave')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
