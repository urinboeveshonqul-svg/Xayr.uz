# XAYR — Cloudflare Turnstile Setup

Turnstile is Cloudflare's privacy-friendly CAPTCHA. It protects abuse-prone
flows with a human-check token that is **always verified server-side** — the
client token is never trusted on its own.

## Protected flows

| Flow | Widget (client) | Server verification |
|---|---|---|
| Registration | `components/auth/RegisterForm.tsx` | `POST /api/auth/signup` |
| Login | `components/auth/LoginForm.tsx` | `POST /api/auth/login` |
| Password reset (send email) | `components/auth/ForgotPasswordForm.tsx` | `POST /api/auth/forgot-password` |
| Contact form | `components/contact/ContactForm.tsx` | `POST /api/contact` |
| Campaign creation | `components/campaigns/CreateCampaignForm.tsx` | `POST /api/campaigns/create` |
| KYC submission | `components/verification/VerificationWizard.tsx` | `POST /api/verification/submit` |

Shared pieces:
- **`lib/turnstile.ts`** — `verifyTurnstile(token, ip)` calls Cloudflare's
  `siteverify` endpoint with `TURNSTILE_SECRET_KEY`.
- **`components/security/Turnstile.tsx`** — the client widget. Renders nothing
  when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset.

## 1. Create a Turnstile widget

1. Go to **Cloudflare Dashboard → Turnstile** (https://dash.cloudflare.com/?to=/:account/turnstile).
2. **Add widget**. Name it (e.g. `xayr`).
3. **Hostnames:** add your production domain (`xayr.uz`) and, for local testing,
   `localhost`.
4. **Widget mode:** *Managed* (recommended — Cloudflare decides when to challenge).
5. Save. Copy the two values:
   - **Site Key** (public) → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - **Secret Key** (private) → `TURNSTILE_SECRET_KEY`

## 2. Set environment variables

Local (`.env.local`) and Vercel (Project → Settings → Environment Variables, **server scope**):

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...   # public, browser widget
TURNSTILE_SECRET_KEY=0x4AAAAAAA...             # SECRET, server only — never NEXT_PUBLIC_*
```

> The secret must **never** carry the `NEXT_PUBLIC_` prefix (that would ship it to the browser).

## 3. Behaviour / failure model

`verifyTurnstile` mirrors the rate-limiter's "never take the site down" philosophy:

| Condition | Result |
|---|---|
| `TURNSTILE_SECRET_KEY` **unset** | **Skipped (allow)** — dev / not-yet-configured. Logs a warning in production. |
| Secret set, **no token** sent | **Blocked (400)** — the common bot case. |
| Secret set, **invalid** token | **Blocked (400)**. |
| Cloudflare unreachable (network error) | **Allowed** — a CF outage must not lock users out. Logged. |

So in production with both keys set, all six flows require a valid token; without
keys (e.g. local dev), everything works and the widget is simply hidden.

Tokens are **single-use**; each form resets its widget after a failed submit so a
fresh token is issued for the retry.

## 4. Local testing without a real account

Cloudflare publishes always-pass / always-block **test keys**
(https://developers.cloudflare.com/turnstile/troubleshooting/testing/). Example
(always passes, visible):

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

## 5. Verify it works

1. With real keys set, open the register/login/contact pages — the Turnstile
   widget renders above the submit button.
2. Submit a form → the request includes `turnstileToken`; the server calls
   siteverify and proceeds only on success.
3. Tamper test: with `TURNSTILE_SECRET_KEY` set, POST to any protected route
   without a `turnstileToken` → expect HTTP 400 `captcha_failed` (or the localized
   message on the auth routes). This confirms the client is never trusted.
