'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MailCheck, ShieldCheck, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Profile email-verification section. Shows confirmed/unconfirmed status and a
 * resend button — which is hidden once the email is verified. Reads the auth
 * user's `email_confirmed_at` (source of truth), never a client-trusted flag.
 */
export function EmailVerificationCard() {
  const { t } = useI18n();
  const [state, setState] = useState<'loading' | 'verified' | 'unverified'>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const u = data.user;
        if (!u) return;
        setEmail(u.email ?? null);
        setState(u.email_confirmed_at ? 'verified' : 'unverified');
      })
      .catch(() => {});
  }, []);

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

  if (state === 'loading') return null;
  const verified = state === 'verified';

  return (
    <div className="card p-4 mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            verified ? 'bg-green-50 dark:bg-green-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'
          }`}
        >
          {verified ? (
            <ShieldCheck className="w-4 h-4 text-green-600" />
          ) : (
            <MailCheck className="w-4 h-4 text-yellow-600" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{t('verify.emailTitle')}</p>
          <p className={`text-xs ${verified ? 'text-green-600' : 'text-yellow-600'}`}>
            {verified ? t('verify.emailVerified') : t('verify.emailNotVerified')}
          </p>
        </div>
      </div>
      {!verified && (
        <button onClick={resend} disabled={sending} className="btn-primary px-4 py-2 text-sm flex-shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
          {t('verify.gateVerify')}
        </button>
      )}
    </div>
  );
}
