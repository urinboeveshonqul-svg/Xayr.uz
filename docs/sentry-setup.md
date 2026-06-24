# XAYR — Sentry Error Monitoring Setup

Sentry (`@sentry/nextjs`) captures errors across the whole stack. It is **inert
until a DSN is configured** — with no `NEXT_PUBLIC_SENTRY_DSN` the SDK initializes
disabled and sends nothing, so dev/preview builds run unchanged.

## What's tracked

| Source | How |
|---|---|
| **Frontend errors** | `sentry.client.config.ts` — uncaught exceptions + unhandled promise rejections in the browser. |
| **React render errors** | `app/global-error.tsx` — root error boundary reports to Sentry and shows a fallback. |
| **API / server exceptions** | `instrumentation.ts` → `onRequestError` forwards App Router server + route-handler errors; `sentry.server.config.ts` initializes the Node SDK. |
| **Middleware failures** | `middleware.ts` calls `Sentry.captureException` in its fail-open catch; `sentry.edge.config.ts` initializes the edge SDK. |

`next.config.mjs` is wrapped with `withSentryConfig` so the client config is
bundled and source maps upload at build time (only when an auth token is set).

## Files

```
instrumentation.ts          # register() per-runtime + onRequestError
sentry.client.config.ts     # browser init (frontend errors)
sentry.server.config.ts     # node init (server/API errors)
sentry.edge.config.ts       # edge init (middleware)
app/global-error.tsx        # React root error boundary → Sentry
next.config.mjs             # withSentryConfig(...) wrapper
```

## 1. Create a Sentry project

1. Sign in at https://sentry.io → **Create Project** → platform **Next.js**.
2. Copy the **DSN** (Project → Settings → Client Keys (DSN)). The DSN is **public
   by design** — safe to expose in the browser bundle.
3. (Optional, for readable stack traces) create an **Auth Token** with
   `project:releases` + `org:read` scope (User Settings → Auth Tokens), and note
   your **org slug** and **project slug**.

## 2. Environment variables

Runtime (Vercel → Project → Settings → Environment Variables):

```
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>   # public — safe in browser
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production         # optional label
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1         # optional, 0..1
```

Build-time only — **secrets**, never `NEXT_PUBLIC_`, never committed (used solely
to upload source maps during `next build`):

```
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=sntrys_********
```

> If `SENTRY_AUTH_TOKEN` is unset, the build still succeeds — source-map upload is
> simply skipped. `.env.sentry-build-plugin` and `.sentryclirc` are git-ignored.

## 3. Secret hygiene (do not expose secrets)

- **DSN** → public, lives in the client bundle. Not a secret.
- **Auth token / org / project** → build-time secrets. Set them in the CI/Vercel
  build environment only. They are never read at runtime and never sent to the browser.
- Server configs prefer a server-only `SENTRY_DSN` and fall back to the public DSN.
- `sendDefaultPii: false` everywhere — cookies, headers, and IPs are not auto-attached.

## 4. Verify

1. Set `NEXT_PUBLIC_SENTRY_DSN` locally in `.env.local` and run the app.
2. Trigger a test error (e.g. a route handler that throws, or `throw new Error('sentry test')`
   in a client component) and confirm the event appears in the Sentry dashboard.
3. Check **frontend** (browser throw), **API** (route handler throw →
   onRequestError), and **middleware** (forced exception) all report.
4. In production, confirm releases show readable stack traces (source maps) when
   the auth token is configured in the build env.

## 5. Tuning

- Adjust sample rates via the env vars above (no code change).
- To capture richer request context on server errors, swap the `onRequestError`
  body in `instrumentation.ts` to `Sentry.captureRequestError(error, request, context)`
  (available in recent `@sentry/nextjs` v8).
