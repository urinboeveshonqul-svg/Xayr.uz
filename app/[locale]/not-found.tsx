import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-brand-500 mb-4">404</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Sahifa topilmadi
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Siz qidirayotgan sahifa mavjud emas yoki o'chirilgan.
        </p>
        <Link href="/" className="btn-primary inline-flex items-center gap-2">
          <Home className="w-4 h-4" />
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}
