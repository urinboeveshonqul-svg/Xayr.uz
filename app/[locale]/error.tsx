'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Xatolik yuz berdi
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Sahifani yuklashda muammo bo'ldi. Qayta urinib ko'ring.
        </p>
        <button onClick={reset} className="btn-primary">
          Qayta urinish
        </button>
      </div>
    </div>
  );
}
