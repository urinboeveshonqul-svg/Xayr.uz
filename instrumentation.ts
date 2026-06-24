// Next.js instrumentation entry. `register()` loads the right Sentry init for the
// active runtime; `onRequestError` forwards server/API route errors to Sentry.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Called by Next.js for errors thrown in server components, route handlers and
// other server code (App Router). No-op when Sentry has no DSN.
export async function onRequestError(error: unknown): Promise<void> {
  Sentry.captureException(error);
}
