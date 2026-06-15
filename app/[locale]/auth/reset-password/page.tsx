import { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Yangi parol — Xayr' };

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const a = (await getDictionary(lng)).auth;

  return (
    <AuthShell locale={lng} title={a.resetTitle} subtitle={a.resetSubtitle}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
