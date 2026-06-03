import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Kirish — Xayr',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <span className="text-3xl">💚</span>
            <span className="text-2xl font-black text-brand-600">Xayr</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Hisobingizga kiring
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Hali hisobingiz yo'qmi?{' '}
            <Link href="/auth/register" className="text-brand-600 font-semibold hover:underline">
              Ro'yxatdan o'ting
            </Link>
          </p>
        </div>
        <div className="card p-8">
          {/*
            LoginForm uses useSearchParams() which requires a Suspense boundary.
            Without this, next build fails with a hard error.
          */}
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-brand-600 animate-spin" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
