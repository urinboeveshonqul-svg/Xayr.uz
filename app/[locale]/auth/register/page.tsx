import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Heart } from 'lucide-react';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton';

export const metadata: Metadata = {
  title: "Ro'yxatdan o'tish — Xayr",
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <Heart className="w-7 h-7 text-brand-600 fill-current" />
            <span className="text-2xl font-black text-brand-600">Xayr</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Hisob yaratish
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Allaqachon hisobingiz bormi?{' '}
            <Link href="/auth/login" className="text-brand-600 font-semibold hover:underline">
              Kiring
            </Link>
          </p>
        </div>
        <div className="card p-8">
          {/* GoogleButton calls useSearchParams() → needs a Suspense boundary. */}
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-brand-600 animate-spin" />
            </div>
          }>
            <GoogleButton />
            <AuthDivider />
          </Suspense>
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
