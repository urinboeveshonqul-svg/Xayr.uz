'use client';

import { Printer } from 'lucide-react';

/** Triggers the browser print dialog (Save as PDF) for the financial report. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors"
    >
      <Printer className="w-4 h-4" /> {label}
    </button>
  );
}
