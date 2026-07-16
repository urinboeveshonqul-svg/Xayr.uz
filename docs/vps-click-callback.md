# XAYR — Click callback VPS (payments.xayr.uz)

This VPS exists for **one reason**: Click requires a static callback IP, and
Vercel's egress/ingress IPs are dynamic. The public site stays on Vercel.

- **Vercel** (`xayr.uz`) — the entire site, donations API, admin, cron. Unchanged.
- **VPS** (`payments.xayr.uz`) — serves **exactly one route**:
  `POST /api/payments/click`. Everything else 404s.

Both connect independently to the **same Supabase**. They never talk to each
other, so there is no service-to-service auth to design.

```
donor browser ──► Vercel (xayr.uz)         ──┐
                                             ├──► Supabase
Click servers ──► VPS (payments.xayr.uz) ────┘
                  static IP 165.245.250.19
```

## Why the whole app is deployed (not an extracted micro-service)

`confirmDonation()` is the single money-crediting path, shared by Click, Payme
and the generic webhook. A second copy on the VPS would eventually drift from
Vercel's — and drift in crediting logic means mis-credited donations. So the
**same repo** is deployed and nginx simply refuses to route anything else.

**No application code was changed for this deployment.** The callback route has
zero Vercel coupling (no `cookies()`, `headers()`, `revalidatePath`, no
middleware dependency), so it runs unmodified under `next start`.

---

## 0. Prerequisites

Assumed present: Ubuntu, Node.js, npm, PM2, nginx, and a working build.

```bash
node -v && npm -v && pm2 -v && nginx -v && node -e "console.log(process.arch)"
```

Repo checkout is assumed at **`/var/www/xayr`**. If it lives elsewhere, change
`cwd` in `deploy/ecosystem.config.js` to match.

---

## 1. Environment (`/var/www/xayr/.env.local`)

Next.js loads `.env.local` from the app's `cwd` at startup, so secrets live in
this file only — never in the committed PM2 config, never in a shell history.

```bash
cd /var/www/xayr
umask 077                      # create the file unreadable by others
nano .env.local                # paste the six vars below, real values
chmod 600 .env.local
ls -l .env.local               # expect -rw------- and your deploy user
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Not used by the callback, but **required for the build to succeed** |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 secret — writes `donations` / `payment_events` |
| `CLICK_SECRET_KEY` | 🔴 secret — MD5 signature verification |
| `CLICK_SERVICE_ID` | Validated against the callback's `service_id` |
| `CLICK_MERCHANT_ID` | ⚠️ **Never used by the callback — but omitting it breaks everything.** `isClickConfigured()` gates the route on all three Click vars; without it every callback answers `-8 Click is not configured` and **no donation ever credits.** |
| `NEXT_PUBLIC_APP_URL` | `https://xayr.uz` — keep pointing at Vercel |

`CLICK_MERCHANT_ID` is the single easiest way to silently break this box. Set it.

### ⚠️ Build-time vs runtime: check before trusting the existing build

Next.js **inlines `NEXT_PUBLIC_*` at build time**. `createAdminClient()` reads
`process.env.NEXT_PUBLIC_SUPABASE_URL`, so if the build was produced **before**
`.env.local` held the real value, the placeholder is baked into `.next/` and
every DB lookup silently fails.

```bash
cd /var/www/xayr
grep -rl "placeholder.supabase.co" .next/ | head
```

- **No output** → the build is good. Do not rebuild.
- **Any match** → the build baked placeholders. **A rebuild is required**
  (`npm run build`). That is a deployment step, not a code change — the source
  is untouched. Server-only vars (`SUPABASE_SERVICE_ROLE_KEY`, `CLICK_*`) are
  read at runtime and never need a rebuild.

---

## 2. PM2

```bash
cd /var/www/xayr
sudo mkdir -p /var/log/pm2 && sudo chown "$USER" /var/log/pm2

pm2 start deploy/ecosystem.config.js
pm2 status
pm2 logs xayr-click-callback --lines 30 --nostream
```

Expect `online`, and a log line like `Ready in …` / `Local: http://127.0.0.1:3000`.

**Binding to `127.0.0.1` is a security control, not a preference.** Default
`next start` binds `0.0.0.0`, which would expose the *entire* app — admin
included — at `http://165.245.250.19:3000`, bypassing nginx's 404 rule
completely. Verify it is loopback-only:

```bash
ss -tlnp | grep 3000       # expect 127.0.0.1:3000 — NOT 0.0.0.0:3000
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/payments/click -X POST   # 200
```

### Survive reboot

```bash
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME"
# ^ prints a `sudo env PATH=... pm2 startup ...` command — RUN THAT COMMAND.
sudo systemctl enable pm2-$USER
```

Verify for real (do not assume):

```bash
sudo reboot
# reconnect, then:
pm2 status                 # must be online with no manual start
ss -tlnp | grep 3000
```

---

## 3. nginx — bootstrap (HTTP only)

The final config references certs that don't exist yet; nginx would refuse to
start and certbot could never create them. Bootstrap first.

```bash
sudo mkdir -p /var/www/certbot

sudo cp /var/www/xayr/deploy/nginx/payments.xayr.uz.bootstrap.conf \
        /etc/nginx/sites-available/payments.xayr.uz
sudo ln -sf /etc/nginx/sites-available/payments.xayr.uz \
            /etc/nginx/sites-enabled/payments.xayr.uz

# Remove nginx's stock catch-all so it can't serve its welcome page here.
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

Firewall (nginx must be public; **3000 must not be**):

```bash
sudo ufw allow 'Nginx Full'      # 80 + 443
sudo ufw allow OpenSSH
sudo ufw deny 3000
sudo ufw status
```

---

## 4. 🚦 DNS gate — verify before certbot

**Checked 2026-07-15: `payments.xayr.uz` returned NXDOMAIN from both Cloudflare
(1.1.1.1) and Google (8.8.8.8), while `xayr.uz` resolved normally.** The zone is
fine; the A record was not yet visible. If that is still true, **certbot will
fail** — HTTP-01 requires the name to resolve to this VPS.

```bash
dig +short payments.xayr.uz @1.1.1.1     # must print 165.245.250.19
```

Required: an **A** record `payments` → `165.245.250.19`, **DNS Only** (grey
cloud). Orange-cloud proxying would both break HTTP-01 and hide the static IP
Click requires — the entire point of this VPS.

Do not proceed until `dig` prints the IP.

---

## 5. Let's Encrypt

```bash
sudo apt-get update && sudo apt-get install -y certbot

sudo certbot certonly --webroot -w /var/www/certbot \
  -d payments.xayr.uz \
  --agree-tos -m <your-email> --no-eff-email

sudo ls -l /etc/letsencrypt/live/payments.xayr.uz/
```

`certonly --webroot` is used rather than `--nginx` so certbot never rewrites our
config — the strict 404 rule stays exactly as written.

If `options-ssl-nginx.conf` / `ssl-dhparams.pem` are missing (certbot installed
without the nginx plugin):

```bash
sudo apt-get install -y python3-certbot-nginx
ls /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/ssl-dhparams.pem
```

Renewal (the cert lasts 90 days — this is not optional):

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

The HTTP→HTTPS block keeps `/.well-known/acme-challenge/` reachable so renewals
keep working. Don't delete it.

---

## 6. nginx — final (HTTPS + 404 everything else)

```bash
sudo cp /var/www/xayr/deploy/nginx/payments.xayr.uz.conf \
        /etc/nginx/sites-available/payments.xayr.uz
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. Verify (run all of these)

```bash
# 1. HTTPS is live and the cert is valid
curl -sI https://payments.xayr.uz/ | head -1

# 2. THE ONLY ROUTE — empty POST. Expect HTTP 200 + JSON error -8.
curl -s -X POST https://payments.xayr.uz/api/payments/click

# 3. Everything else 404s
curl -s -o /dev/null -w '%{http_code}\n' https://payments.xayr.uz/
curl -s -o /dev/null -w '%{http_code}\n' https://payments.xayr.uz/uz/admin
curl -s -o /dev/null -w '%{http_code}\n' https://payments.xayr.uz/api/donations
curl -s -o /dev/null -w '%{http_code}\n' https://payments.xayr.uz/api/payments/click   # GET → 404

# 4. HTTP redirects to HTTPS
curl -sI http://payments.xayr.uz/api/payments/click | head -1     # 301

# 5. Next.js is NOT publicly exposed
curl -s --max-time 5 -o /dev/null -w '%{http_code}\n' http://165.245.250.19:3000/   # must fail/timeout
```

### Reading test 2 — it tells you exactly what's wrong

Both cases return `error: -8`; **the `error_note` is the tell**:

| Response | Meaning |
|---|---|
| `"error_note":"Missing or malformed parameters"` | ✅ **Correct.** Route live, env loaded, Click configured. |
| `"error_note":"Click is not configured"` | ❌ A `CLICK_*` var is missing — usually `CLICK_MERCHANT_ID`. |
| `404` | ❌ nginx isn't routing — check the location block. |
| `502` | ❌ nginx is up, Next is not — `pm2 status`. |

### End-to-end test (proves signature + Supabase, not just routing)

Test 2 never reaches the database. This one does — it sends a **correctly
signed** Prepare for a donation that doesn't exist.

```bash
cd /var/www/xayr && set -a && . ./.env.local && set +a

CTID=1; MTI=click_smoketest_does_not_exist; AMT=1000.00; ACT=0
ST="$(date -u '+%Y-%m-%d %H:%M:%S')"
SIGN=$(printf '%s' "${CTID}${CLICK_SERVICE_ID}${CLICK_SECRET_KEY}${MTI}${AMT}${ACT}${ST}" | md5sum | cut -d' ' -f1)

curl -s -X POST https://payments.xayr.uz/api/payments/click \
  -d "click_trans_id=$CTID" -d "service_id=$CLICK_SERVICE_ID" \
  -d "merchant_trans_id=$MTI" -d "amount=$AMT" -d "action=$ACT" \
  -d "error=0" -d "sign_time=$ST" -d "sign_string=$SIGN"
```

| Response | Meaning |
|---|---|
| `error: -5`, `"Transaction param not found"` | ✅ **Ideal.** Signature verified **and** Supabase was reached — the donation genuinely doesn't exist. The full path works. |
| `error: -1`, `"SIGN CHECK FAILED"` | ❌ `CLICK_SECRET_KEY` or `CLICK_SERVICE_ID` is wrong. |
| `error: -8` | ❌ Env not loaded. |

⚠️ A bad `NEXT_PUBLIC_SUPABASE_URL` **also** yields `-5` (the query fails →
donation reads as missing). If `-5` appears but you're unsure, check
`pm2 logs xayr-click-callback` for fetch errors and re-run the `.next/` grep in
§1.

---

## 8. Click merchant cabinet

Set **both** Prepare URL and Complete URL to the same endpoint — the `action`
field distinguishes them:

```
https://payments.xayr.uz/api/payments/click
```

Then run a sandbox payment and confirm: donation reaches `completed`, campaign
total rises, and `payment_events` holds two processed rows (`<click_trans_id>:0`
and `:1`).

---

## Rollback

One field, no deploy: point the cabinet URLs back at
`https://xayr.uz/api/payments/click`. That route is still deployed on Vercel and
costs nothing to keep — it is the escape hatch.

## Operational risks

- 🔴 **Single point of failure.** Vercel is multi-region; this is one box. If it
  dies, callbacks fail and donations sit `pending` — never lost or double-
  credited (Click retries; `confirmDonation` is idempotent and pending-only) —
  but Click's docs warn repeated failures push a payment to *ручное
  разбирательство* (manual review). **Uptime monitoring on this host is
  mandatory.**
- 🟠 **Config drift.** Two deployments of one repo: deploy both from the same
  commit. A stale VPS means stale signature/crediting logic.
- 🟠 **The service-role key now lives on a box you administer.** `chmod 600`,
  restricted SSH, unattended-upgrades. The route already redacts `sign_string`
  from logs.

## Redeploying after a code change

```bash
cd /var/www/xayr
git pull origin main
npm ci
npm run build
pm2 reload xayr-click-callback
```
