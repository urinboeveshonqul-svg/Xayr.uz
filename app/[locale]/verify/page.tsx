import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { VerificationWizard } from '@/components/verification/VerificationWizard';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { Clock, ShieldCheck, XCircle, Lock } from 'lucide-react';

export const metadata: Metadata = { title: 'Shaxsni tasdiqlash — Xayr' };
export const dynamic = 'force-dynamic';

export default async function VerifyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(lng);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${lng}/auth/login?next=/verify`);

  const { data: profile } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', user.id)
    .single();
  const status = profile?.verification_status ?? 'unverified';

  let reason: string | null = null;
  if (status === 'rejected') {
    const { data: req } = await supabase
      .from('verification_requests')
      .select('rejection_reason')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    reason = req?.rejection_reason ?? null;
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-xl">
          <div className="mb-6 text-center">
            <h1 className="section-title">{dict.verify.title}</h1>
            <p className="section-sub">{dict.verify.subtitle}</p>
          </div>

          {/* Trust-building strip — reassures the user before they share documents */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { Icon: ShieldCheck, label: dict.verify.trustSecure },
              { Icon: Lock, label: dict.verify.trustPrivate },
              { Icon: Clock, label: dict.verify.trustReview },
            ].map(({ Icon, label }, i) => (
              <div key={i} className="card p-4 flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</span>
              </div>
            ))}
          </div>

          {status === 'verified' && (
            <div className="card p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">{dict.verify.statusVerified}</p>
              <p className="text-gray-500 dark:text-gray-400">{dict.verify.verifiedMsg}</p>
            </div>
          )}

          {status === 'pending' && (
            <div className="card p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center mb-4">
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">{dict.verify.statusPending}</p>
              <p className="text-gray-500 dark:text-gray-400">{dict.verify.pendingMsg}</p>
            </div>
          )}

          {(status === 'unverified' || status === 'rejected') && (
            <>
              {status === 'rejected' && (
                <div className="card p-5 mb-5 border-red-200 dark:border-red-900/40">
                  <div className="flex items-center gap-2 text-red-600 font-bold mb-1">
                    <XCircle className="w-5 h-5" /> {dict.verify.statusRejected}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{dict.verify.rejectedMsg}</p>
                  {reason && (
                    <p className="text-sm mt-2"><span className="font-semibold">{dict.verify.reason}:</span> {reason}</p>
                  )}
                </div>
              )}
              <VerificationWizard userId={user.id} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
