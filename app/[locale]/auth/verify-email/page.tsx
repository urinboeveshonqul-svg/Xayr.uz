import { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck, Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Emailni tasdiqlang — Xayr',
};

interface Props {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Heart className="w-7 h-7 text-brand-600 fill-current" />
          <span className="text-2xl font-black text-brand-600">Xayr</span>
        </Link>
        <div className="card p-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-5">
            <MailCheck className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Emailingizni tasdiqlang
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 leading-relaxed">
            {email ? (
              <>
                <span className="font-semibold">{email}</span> manziliga tasdiqlash
                havolasini yubordik.
              </>
            ) : (
              'Email manzilingizga tasdiqlash havolasini yubordik.'
            )}{' '}
            Hisobingizni faollashtirish uchun xatdagi havolani bosing.
          </p>
          <Link href="/auth/login" className="btn-primary w-full py-3">
            Kirishga o'tish
          </Link>
          <p className="text-xs text-gray-400 mt-4">
            Xat kelmadimi? Spam papkasini tekshiring.
          </p>
        </div>
      </div>
    </div>
  );
}
