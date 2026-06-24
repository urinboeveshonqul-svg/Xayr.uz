import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RequiredLabelProps {
  children: ReactNode;
  /** Extra classes appended to the shared `.label` styling (e.g. "mb-0"). */
  className?: string;
  htmlFor?: string;
}

/**
 * Label for a REQUIRED form field. Renders the shared `.label` style plus a red
 * asterisk so the required marker is consistent and easy to spot across the
 * whole app (single source of truth for the asterisk color). The label text
 * itself is unchanged; only the asterisk is red. Works in light + dark mode
 * (red-500 / red-400 for contrast). Presentational + server-safe.
 */
export function RequiredLabel({ children, className, htmlFor }: RequiredLabelProps) {
  return (
    <label htmlFor={htmlFor} className={cn('label', className)}>
      {children}
      <span className="text-red-500 dark:text-red-400"> *</span>
    </label>
  );
}
