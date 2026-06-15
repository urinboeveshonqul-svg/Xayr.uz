import { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Emailni tasdiqlang — Xayr' };

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { email } = await searchParams;
  const lng = isLocale(locale) ? locale : 'uz';
  const a = (await getDictionary(lng)).auth;

  return (
    <AuthShell locale={lng} title={a.verifyTitle}>
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-5">
          <MailCheck className="w-8 h-8 text-green-600" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 leading-relaxed">
          {email ? (
            <>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{email}</span> {a.verifySentTo}
            </>
          ) : (
            a.verifyBodyGeneric
          )}{' '}
          {a.verifyActivate}
        </p>
        <Link href={`/${lng}/auth/login`} className="btn-primary w-full py-3">
          {a.goToLogin}
        </Link>
        <p className="text-xs text-gray-400 mt-4">{a.checkSpam}</p>
      </div>
    </AuthShell>
  );
}
