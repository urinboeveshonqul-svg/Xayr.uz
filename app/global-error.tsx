'use client';

// Root-level error boundary. Catches errors thrown in the root layout/render
// that the localized app/[locale]/error.tsx can't, reports them to Sentry, and
// renders a minimal self-contained fallback (it replaces the whole document).
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="uz">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '24px',
          background: '#f9fafb',
          color: '#111827',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Xatolik yuz berdi</h1>
          <p style={{ color: '#6b7280', marginBottom: 20 }}>
            Kutilmagan xatolik. Iltimos, qayta urinib ko&apos;ring.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '12px 24px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Qayta urinish
          </button>
        </div>
      </body>
    </html>
  );
}
