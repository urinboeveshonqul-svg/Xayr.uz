// Sentry — browser/client init. Captures frontend errors (uncaught exceptions,
// unhandled promise rejections, React render errors via app/global-error.tsx).
// The DSN is public by design (safe to ship to the browser). With no DSN the SDK
// is fully inert, so dev/preview without Sentry configured behaves unchanged.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // Conservative perf sampling; tune via env without a redeploy of code.
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  // Never attach cookies/headers/user IP automatically — avoid leaking PII.
  sendDefaultPii: false,
});
