#!/usr/bin/env bash
# ============================================================
# XAYR — Click callback VPS deployment (payments.xayr.uz)
#
# Run ON THE VPS, from the repo root, as the deploy user (needs sudo):
#
#     cd /var/www/xayr
#     bash deploy/deploy-click-callback.sh you@example.com
#
# Idempotent: safe to re-run after fixing anything. Every step is verified
# rather than assumed, and it stops with an exact reason on failure.
#
# It NEVER prints secret values — only variable NAMES.
#
# Deploys the existing repo unchanged. No application code, payment logic,
# signature verification, Supabase schema or frontend is touched. nginx exposes
# exactly one route: POST /api/payments/click.
#
# Full explanation: docs/vps-click-callback.md
# ============================================================
set -euo pipefail

DOMAIN="payments.xayr.uz"
APP_NAME="xayr-click-callback"
PORT=3000
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env.local"
CERT_EMAIL="${1:-}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
info()  { printf '\n\033[1m── %s\033[0m\n' "$*"; }
die()   { red "FAILED: $*"; exit 1; }

[ -n "$CERT_EMAIL" ] || die "Pass an email for Let's Encrypt: bash $0 you@example.com"

# ── 0. Prerequisites ────────────────────────────────────────────────────────
info "0. Prerequisites"
for c in node npm pm2 nginx curl openssl; do
  command -v "$c" >/dev/null || die "'$c' is not installed."
done
echo "node $(node -v) | npm $(npm -v) | pm2 $(pm2 -v 2>/dev/null | tail -1) | $(nginx -v 2>&1)"
green "OK"

# ── 1. Environment ──────────────────────────────────────────────────────────
info "1. Environment ($ENV_FILE)"
[ -f "$ENV_FILE" ] || die "$ENV_FILE does not exist. Create it with the 7 required variables (names in docs/vps-click-callback.md §1). Never commit it."

REQUIRED=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  CLICK_SERVICE_ID
  CLICK_MERCHANT_ID
  CLICK_SECRET_KEY
  NEXT_PUBLIC_APP_URL
)
missing=()
for v in "${REQUIRED[@]}"; do
  grep -qE "^[[:space:]]*${v}=[^[:space:]]" "$ENV_FILE" || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  red "Missing or empty in $ENV_FILE:"
  printf '  - %s\n' "${missing[@]}"
  echo
  echo "NOTE: CLICK_MERCHANT_ID is never read by the callback itself, but"
  echo "isClickConfigured() gates the route on all three CLICK_* vars — omit it"
  echo "and every callback answers '-8 Click is not configured' and NO donation"
  echo "will ever credit."
  die "Add the variables above (values only you have), then re-run."
fi

# Placeholder detection — a build baked with these silently can't reach Supabase.
if grep -qE "^[[:space:]]*NEXT_PUBLIC_SUPABASE_URL=.*placeholder" "$ENV_FILE"; then
  die "NEXT_PUBLIC_SUPABASE_URL is still a placeholder. Set the real project URL."
fi

chmod 600 "$ENV_FILE"
echo "All 7 required variables present (values not shown). Permissions: $(stat -c '%a %U' "$ENV_FILE")"
green "OK"

# ── 2. Production build ─────────────────────────────────────────────────────
# Mandatory: NEXT_PUBLIC_* are INLINED AT BUILD TIME. createAdminClient() reads
# NEXT_PUBLIC_SUPABASE_URL, so a build made before .env.local held real values
# bakes the placeholder in and every DB lookup silently fails.
info "2. Production build"
cd "$REPO_DIR"
[ -d node_modules ] || npm ci
npm run build
if grep -rl "placeholder.supabase.co" .next/ 2>/dev/null | head -1 | grep -q .; then
  die "Build still contains 'placeholder.supabase.co'. .env.local was not picked up."
fi
green "OK — build clean, no placeholders baked in"

# ── 3. PM2 ──────────────────────────────────────────────────────────────────
info "3. PM2"
sudo mkdir -p /var/log/pm2 && sudo chown "$USER" /var/log/pm2
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start deploy/ecosystem.config.js
sleep 4
pm2 describe "$APP_NAME" >/dev/null || die "PM2 process did not start."
pm2 status

# Loopback-only is a SECURITY control: default 0.0.0.0 would expose the whole
# app (admin included) on <vps-ip>:3000, bypassing nginx's 404 rule entirely.
if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:$PORT"; then
  die "Next is bound to 0.0.0.0:$PORT — it must be 127.0.0.1 only. Check ecosystem.config.js args."
fi
ss -tlnp 2>/dev/null | grep ":$PORT" || true

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/payments/click" || true)
[ "$code" = "200" ] || die "Local callback returned $code (expected 200). Check: pm2 logs $APP_NAME"
green "OK — online, loopback-only, responding locally"

info "3b. Survive reboot"
pm2 save
echo "Run the sudo command PM2 prints below if it is not already configured:"
pm2 startup systemd -u "$USER" --hp "$HOME" || true
green "OK — after running that sudo line once, verify with: sudo reboot && pm2 status"

# ── 4. nginx bootstrap (HTTP only, so certbot can run) ──────────────────────
info "4. nginx — bootstrap"
sudo mkdir -p /var/www/certbot
sudo cp "$REPO_DIR/deploy/nginx/$DOMAIN.bootstrap.conf" "/etc/nginx/sites-available/$DOMAIN"
sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo rm -f /etc/nginx/sites-enabled/default   # stop the stock welcome page
sudo nginx -t || die "nginx config test failed."
sudo systemctl reload nginx
green "OK"

# ── 5. Firewall ─────────────────────────────────────────────────────────────
info "5. Firewall"
if command -v ufw >/dev/null; then
  sudo ufw allow OpenSSH >/dev/null 2>&1 || true
  sudo ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  sudo ufw deny "$PORT" >/dev/null 2>&1 || true
  sudo ufw --force enable >/dev/null 2>&1 || true
  sudo ufw status verbose | head -12
  green "OK — 80/443 open, $PORT denied"
else
  red "ufw not installed — skipping (Next is still loopback-only)."
fi

# ── 6. DNS gate ─────────────────────────────────────────────────────────────
# certbot's HTTP-01 challenge REQUIRES the name to resolve to this box.
info "6. DNS gate"
resolved="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$resolved" ]; then
  red "$DOMAIN does not resolve."
  echo "Create an A record:  payments -> <this VPS public IPv4>, proxy DISABLED (grey cloud)."
  echo "Cloudflare proxying would break HTTP-01 AND hide the static IP Click requires."
  die "DNS must resolve before Let's Encrypt can issue a certificate."
fi
echo "$DOMAIN resolves to $resolved (this host's public IP: $(curl -s --max-time 8 ifconfig.me || echo unknown))"
green "OK"

# ── 7. Let's Encrypt ────────────────────────────────────────────────────────
info "7. Let's Encrypt"
command -v certbot >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y certbot python3-certbot-nginx; }
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  # certonly --webroot so certbot NEVER rewrites our config and weakens the 404 rule.
  sudo certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
    --agree-tos -m "$CERT_EMAIL" --no-eff-email --non-interactive \
    || die "certbot failed. Confirm $DOMAIN resolves to this VPS and port 80 is open."
else
  echo "Certificate already present — skipping issuance."
fi
# The final config includes these; generate if the nginx plugin didn't.
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] || sudo apt-get install -y python3-certbot-nginx
[ -f /etc/letsencrypt/ssl-dhparams.pem ] || sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
sudo certbot renew --dry-run >/dev/null 2>&1 && green "OK — auto-renewal verified" || red "WARN: renewal dry-run failed; check 'systemctl list-timers | grep certbot'"

# ── 8. nginx final (HTTPS + strict 404) ─────────────────────────────────────
info "8. nginx — final"
sudo cp "$REPO_DIR/deploy/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN"
sudo nginx -t || die "final nginx config test failed."
sudo systemctl reload nginx
green "OK"

# ── 9. Validation ───────────────────────────────────────────────────────────
info "9. Validation"
fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then green "  PASS  $1 ($3)"; else red "  FAIL  $1 (expected $2, got $3)"; fail=1; fi
}
c() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" || echo 000; }

check "POST /api/payments/click"      200 "$(c -X POST "https://$DOMAIN/api/payments/click")"
check "GET  /api/payments/click → 404" 404 "$(c "https://$DOMAIN/api/payments/click")"
check "GET  /            → 404"        404 "$(c "https://$DOMAIN/")"
check "GET  /uz/admin    → 404"        404 "$(c "https://$DOMAIN/uz/admin")"
check "GET  /api/donations → 404"      404 "$(c "https://$DOMAIN/api/donations")"
check "HTTP → HTTPS redirect"          301 "$(c "http://$DOMAIN/api/payments/click")"

echo
echo "  SSL:"
echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null | sed 's/^/    /' || red "    could not read certificate"

echo
echo "  Callback response (expect error -8 'Missing or malformed parameters'):"
curl -s -X POST "https://$DOMAIN/api/payments/click" | sed 's/^/    /'
echo

echo "  Port 3000 must NOT be publicly reachable:"
pub="$(curl -s --max-time 8 ifconfig.me || echo '')"
if [ -n "$pub" ]; then
  ext="$(curl -s --max-time 6 -o /dev/null -w '%{http_code}' "http://$pub:$PORT/" || echo 000)"
  [ "$ext" = "000" ] && green "    PASS  unreachable externally" || { red "    FAIL  reachable (HTTP $ext)"; fail=1; }
fi

echo
info "Summary"
echo "  PM2:      $(pm2 jlist 2>/dev/null | grep -o "\"status\":\"[a-z]*\"" | head -1)"
echo "  nginx:    $(systemctl is-active nginx)"
echo "  Listening:"; ss -tlnp 2>/dev/null | grep -E ':(80|443|3000)\b' | awk '{print "    "$1" "$4}'
echo "  Callback: https://$DOMAIN/api/payments/click"
echo "  Env vars (names only): ${REQUIRED[*]}"

if [ "$fail" -eq 0 ]; then
  green "
DEPLOYMENT OK — production ready.

Next: in the Click merchant cabinet set BOTH the Prepare URL and Complete URL to
  https://$DOMAIN/api/payments/click
then run a sandbox payment and confirm the donation reaches 'completed' and
payment_events holds two processed rows (<click_trans_id>:0 and :1).

If the callback above said 'Click is not configured' instead of 'Missing or
malformed parameters', a CLICK_* variable is missing — usually CLICK_MERCHANT_ID."
else
  die "One or more validations failed — see FAIL lines above."
fi
