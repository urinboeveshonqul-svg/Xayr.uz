import { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Parolni tiklash — Xayr' };

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const a = (await getDictionary(lng)).auth;

  return (
    <AuthShell
      locale={lng}
      title={a.forgotTitle}
      subtitle={a.forgotSubtitle}
      footer={
        <Link href={`/${lng}/auth/login`} className="text-brand-600 font-semibold hover:underline">
          {a.backToLogin}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
