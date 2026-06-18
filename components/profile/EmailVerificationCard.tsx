'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MailCheck, Loader2, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Email-verification reminder. Renders ONLY while the email is unverified —
 * verified users see nothing here (a subtle check sits next to the email in the
 * profile form instead). Polls the auth state, so when the user confirms in
 * another tab the card animates away (fade + collapse, 250ms) and the profile
 * refreshes — no manual reload. Announces success to screen readers.
 */
export function EmailVerificationCard() {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'verified' | 'unverified'>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async (initial: boolean) => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      if (u.email) setEmail(u.email);

      if (u.email_confirmed_at) {
        if (done.current) return;
        done.current = true;
        if (timer) clearInterval(timer);
        if (initial) {
          setStatus('verified'); // never showed the card — nothing to animate
        } else {
          setAnnounce(true);     // verified while on the page → animate away
          setExiting(true);
          setTimeout(() => {
            setStatus('verified');
            router.refresh();
          }, 280);
        }
      } else if (initial) {
        setStatus('unverified');
      }
    };

    check(true);
    timer = setInterval(() => check(false), 5000);
    return () => { if (timer) clearInterval(timer); };
  }, [router]);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      const { error } = await createClient().auth.resend({ type: 'signup', email });
      if (error) toast.error(error.message);
      else { setSentOnce(true); toast.success(t('verify.bannerSent')); }
    } catch {
      toast.error(t('auth.unexpected'));
    } finally {
      setSending(false);
    }
  };

  // Verified or still loading → render nothing (no empty spacing, no success card).
  if (status !== 'unverified') {
    return announce ? (
      <p role="status" aria-live="polite" className="sr-only">{t('verify.emailVerifiedAnnounce')}</p>
    ) : null;
  }

  return (
    <div
      className={`overflow-hidden transition-all duration-[250ms] ease-out ${
        exiting ? 'max-h-0 opacity-0 mb-0' : 'max-h-72 opacity-100 mb-6'
      }`}
    >
      <div className="card p-5 border-l-4 border-l-yellow-400">
        <span role="status" aria-live="polite" className="sr-only">
          {announce ? t('verify.emailVerifiedAnnounce') : ''}
        </span>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-4 h-4 text-yellow-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('verify.cardTitle')}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{t('verify.cardDesc')}</p>
            {email && <p className="text-xs text-gray-400 mt-1 truncate">{email}</p>}
            {sentOnce && <p className="text-xs text-green-600 mt-1">{t('verify.cardSent')}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={resend} disabled={sending} className="btn-primary px-4 py-2 text-sm">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                {t('verify.cardVerify')}
              </button>
              <button
                onClick={resend}
                disabled={sending}
                className="btn-ghost px-4 py-2 text-sm border border-gray-200 dark:border-gray-700"
              >
                {t('verify.cardResend')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
