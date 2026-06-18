'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MailCheck, Loader2, X, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

const RESEND_SECONDS = 60;

/**
 * Email-verification gate for campaign creation. Sends a 6-digit code, lets the
 * user enter it in-app (auth.verifyOtp), and on success calls onVerified so the
 * caller continues seamlessly — no redirect, no re-click. Also polls in case the
 * user confirms via the email link in another tab. The single, reusable gate.
 *
 * Requires the Supabase "Confirm signup" email template to include the token
 * code ({{ .Token }}); the link still works too.
 */
export function VerifyEmailModal({
  onClose,
  onVerified,
}: {
  onClose: () => void;
  onVerified?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'codeSent'>('idle');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const done = useRef(false);

  const succeed = () => {
    if (done.current) return;
    done.current = true;
    toast.success(t('verify.emailVerifiedAnnounce'));
    onVerified?.();
    router.refresh();
    onClose();
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));

    // Auto-continue if the user confirms via the email link in another tab.
    const poll = setInterval(async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user?.email_confirmed_at) succeed();
    }, 5000);

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      clearInterval(poll);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (countdown <= 0) return;
    const tmr = setTimeout(() => setCountdown((s) => s - 1), 1000);
    return () => clearTimeout(tmr);
  }, [countdown]);

  const sendCode = async () => {
    if (!email || sending) return;
    setSending(true);
    setError(null);
    try {
      const { error: err } = await createClient().auth.resend({ type: 'signup', email });
      if (err) {
        setError(err.message);
        return;
      }
      setPhase('codeSent');
      setCountdown(RESEND_SECONDS);
      toast.success(t('verify.cardSent'));
    } catch {
      setError(t('auth.unexpected'));
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    const token = code.replace(/\D/g, '').slice(0, 6);
    if (token.length < 6 || !email || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const { error: err } = await createClient().auth.verifyOtp({ email, token, type: 'signup' });
      if (err) {
        setError(/expired/i.test(err.message) ? t('verify.otpExpired') : t('verify.otpInvalid'));
        return;
      }
      succeed();
    } catch {
      setError(t('auth.unexpected')); // network — keep code + state for retry
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 animate-pop"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end -mt-1 -mr-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('verify.gateLater')}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
          <ShieldCheck className="w-7 h-7 text-brand-600" />
        </div>
        <h2 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">{t('verify.otpTitle')}</h2>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">{t('verify.otpDesc')}</p>
        {email && <p className="text-sm text-center font-semibold text-gray-700 dark:text-gray-200 mb-5">{email}</p>}

        {phase === 'idle' ? (
          <button type="button" onClick={sendCode} disabled={sending || !email} className="btn-primary w-full py-3 min-h-[48px]">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <MailCheck className="w-5 h-5" />}
            {t('verify.otpSend')}
          </button>
        ) : (
          <div className="space-y-3">
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t('verify.otpCodePlaceholder')}
              className="input text-center text-lg tracking-[0.5em] font-bold"
              aria-label={t('verify.otpEnter')}
              autoFocus
            />
            <button type="button" onClick={verify} disabled={verifying || code.length < 6} className="btn-primary w-full py-3 min-h-[48px]">
              {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {t('verify.otpVerify')}
            </button>
            <button
              type="button"
              onClick={sendCode}
              disabled={countdown > 0 || sending}
              className="btn-ghost w-full py-2 text-sm disabled:opacity-60"
            >
              {countdown > 0 ? t('verify.otpResendIn').replace('{s}', String(countdown)) : t('verify.otpResend')}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-red-500 text-sm text-center mt-3">{error}</p>
        )}
      </div>
    </div>
  );
}
