// Sentry — Node.js server init. Captures server exceptions and API route errors
// (wired through the onRequestError hook in instrumentation.ts). DSN may be set
// as a server-only SENTRY_DSN or reuse the public NEXT_PUBLIC_SENTRY_DSN.
// Inert when no DSN is configured.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  // Do not auto-attach request PII (cookies, headers, IP).
  sendDefaultPii: false,
});
