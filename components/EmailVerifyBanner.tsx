'use client';

import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

export function EmailVerifyBanner() {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Guard: if Supabase is unavailable (or env not yet configured) the client
    // constructor or the network call can throw — the banner is non-critical, so
    // fail silently instead of bubbling to the error boundary and blanking the page.
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const u = data?.user;
        if (u && !u.email_confirmed_at && u.email) setEmail(u.email);
      })
      .catch(() => {
        /* Supabase unreachable — leave the banner hidden. */
      });
  }, []);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) toast.error(error.message);
      else toast.success(t('verify.bannerSent'));
    } catch {
      toast.error(t('verify.bannerResend'));
    } finally {
      setSending(false);
    }
  };

  if (!email || dismissed) return null;

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-900">
      <div className="container mx-auto px-4 py-2.5 flex items-center gap-3 text-sm">
        <Mail className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {t('verify.bannerEmail')} — <span className="font-semibold break-all">{email}</span>
        </span>
        <button
          onClick={resend}
          disabled={sending}
          className="font-bold underline hover:no-underline disabled:opacity-50 whitespace-nowrap"
        >
          {t('verify.bannerResend')}
        </button>
        <button onClick={() => setDismissed(true)} aria-label="Close" className="p-1 hover:text-yellow-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
