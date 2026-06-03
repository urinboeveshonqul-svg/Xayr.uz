import { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Parolni tiklash — Xayr',
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <span className="text-3xl">💚</span>
            <span className="text-2xl font-black text-brand-600">Xayr</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Parolni unutdingizmi?
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Email manzilingizni kiriting — biz parolni tiklash havolasini yuboramiz.
          </p>
        </div>
        <div className="card p-8">
          <ForgotPasswordForm />
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            <Link href="/auth/login" className="text-brand-600 font-semibold hover:underline">
              Kirishga qaytish
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
