import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton';
import { AuthShell } from '@/components/auth/AuthShell';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = { title: "Ro'yxatdan o'tish — Xayr" };

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lng = isLocale(locale) ? locale : 'uz';
  const a = (await getDictionary(lng)).auth;

  return (
    <AuthShell
      locale={lng}
      title={a.registerTitle}
      subtitle={
        <>
          {a.registerSubtitle}{' '}
          <Link href={`/${lng}/auth/login`} className="text-brand-600 font-semibold hover:underline">
            {a.loginCta}
          </Link>
        </>
      }
    >
      {/* GoogleButton calls useSearchParams() → needs a Suspense boundary. */}
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-brand-600 animate-spin" />
          </div>
        }
      >
        <GoogleButton />
        <AuthDivider />
      </Suspense>
      <RegisterForm />
    </AuthShell>
  );
}
