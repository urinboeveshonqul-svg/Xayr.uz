// ============================================================
// PM2 — Click callback host (payments.xayr.uz)
//
// This VPS exists ONLY so Click has a static callback IP. The public site
// stays on Vercel. The SAME repository is deployed here, but nginx exposes
// exactly one route (POST /api/payments/click); everything else 404s.
//
// Deploying the whole app (rather than extracting the route) is deliberate:
// confirmDonation() is the single money-crediting path, and a second copy of
// it would eventually drift from the Vercel one. One repo, one truth.
//
//   pm2 start deploy/ecosystem.config.js
//   pm2 save
//
// See docs/vps-click-callback.md for the full runbook.
// ============================================================

module.exports = {
  apps: [
    {
      name: 'xayr-click-callback',

      // Invoke Next's binary directly — more reliable under PM2 than `npm run
      // start`, which would fork an extra shell and swallow signals.
      script: 'node_modules/next/dist/bin/next',
      interpreter: 'node',

      // -H 127.0.0.1 is a SECURITY control, not a preference. Without it Next
      // binds 0.0.0.0 and the ENTIRE app (admin, every API route) is reachable
      // at http://<vps-ip>:3000, completely bypassing nginx's 404 rule. Bound
      // to loopback, nginx is the only way in. UFW blocking 3000 is the second
      // layer; keep both.
      args: 'start -H 127.0.0.1 -p 3000',

      // Absolute path to the checkout on the VPS. Change here if you deploy
      // somewhere other than /var/www/xayr.
      cwd: '/var/www/xayr',

      // A webhook receiver: one process is plenty, and cluster mode would only
      // add coordination risk. Next.js does not need it here.
      instances: 1,
      exec_mode: 'fork',

      // Next.js loads .env.local from `cwd` itself, so secrets stay in that
      // file (chmod 600) and never appear in this committed config.
      env: {
        NODE_ENV: 'production',
      },

      autorestart: true,
      max_restarts: 10,
      // A callback that dies must come back fast — Click retries, and repeated
      // failures push a payment into manual review on their side.
      restart_delay: 2000,
      max_memory_restart: '512M',

      error_file: '/var/log/pm2/xayr-click-callback.error.log',
      out_file: '/var/log/pm2/xayr-click-callback.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
