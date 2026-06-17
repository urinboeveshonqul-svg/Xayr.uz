'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MailCheck, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Professional gate shown when an unverified user attempts a creator-only action
 * (e.g. creating a campaign). Explains why verification is required and lets them
 * resend the confirmation email. "Later" simply dismisses — onboarding is never
 * a hard wall except for the restricted action itself.
 */
export function VerifyEmailModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      const { error } = await createClient().auth.resend({ type: 'signup', email });
      if (error) toast.error(error.message);
      else toast.success(t('verify.bannerSent'));
    } catch {
      toast.error(t('auth.unexpected'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
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
          <button type="button" onClick={onClose} aria-label={t('verify.gateLater')} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
          <MailCheck className="w-7 h-7 text-brand-600" />
        </div>
        <h2 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">
          {t('verify.gateTitle')}
        </h2>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          {t('verify.gateBody')}
          {email && <> <span className="font-semibold break-all">{email}</span></>}
        </p>
        <div className="space-y-2">
          <button type="button" onClick={resend} disabled={sending} className="btn-primary w-full py-3 min-h-[48px]">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <MailCheck className="w-5 h-5" />}
            {t('verify.gateVerify')}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost w-full py-3">
            {t('verify.gateLater')}
          </button>
        </div>
      </div>
    </div>
  );
}
