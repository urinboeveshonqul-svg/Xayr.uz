# Xayr — Security Audit

Review of RLS policies, API routes, webhook security, and share-tracking abuse.
Severity: 🔴 high · 🟠 medium · 🟡 low · ✅ sound.

## Summary
The security model is **strong for the stage**: tamper-proof donations,
column-level privilege controls, SECURITY DEFINER functions with ownership
checks, and service-role usage confined to the server. No privilege-escalation
path was found in the reviewed code. A few low-severity hardening items below.

## 1. RLS policies
| Area | Finding |
|---|---|
| **Privilege escalation** | ✅ `users` table-level UPDATE revoked; column-level grant excludes `role`/`id`/`email`/`verification_status` (`admin-dashboard.sql`, `verification.sql`). Users cannot self-promote; role changes only via the admin set-role API (service role). |
| **Donations tamper-proofing** | ✅ `donations_insert_pending` lets clients insert only `status='pending'`; moving to `completed` requires the service role (`confirmDonation`). `apply_donation` credits totals only on completion. |
| **Protected campaign fields** | ✅ `guard_campaign_protected_fields` resets `status`/`current_amount`/`donors_count`/`views` for non-admins (bypass flag only for the donation-credit path). |
| **Campaign ownership** | ✅ `campaigns_update_own` = `user_id = auth.uid() OR is_admin()` — owners + admins only. |
| **Notifications** | ✅ No client INSERT policy; all rows written by SECURITY DEFINER triggers. Users select/update/delete only their own. |
| **Own-row tables** | ✅ `saved_campaigns`, `recently_viewed`, `notification_preferences`, `creator_followers` scoped to `auth.uid()`. |
| **Aggregate RPCs** | ✅ `get_share_stats` / `get_donor_stats` are SECURITY DEFINER and check campaign ownership / `is_admin()` (or privacy flag) before returning. |
| **Storage** | ✅ Own-folder policies on `avatars`/`campaign-images`/`campaign-reports`; `verification-documents` bucket is private (admin-signed URLs only). |

## 2. API routes
| Route | Finding |
|---|---|
| `POST /api/donations` | ✅ IP rate-limited, Zod-validated, service-role insert forced to `pending`, campaign must be `active`. |
| `POST /api/admin/*` (donations, verifications, set-role) | ✅ `requireAdmin()` (auth.getUser + `role='admin'`) before any service-role write. |
| `POST /api/auth/login`, `/signup` | 🟠 Routed server-side for rate-limiting (per design). **Verify** the rate-limit is actually enforced on these routes in production. |
| `POST /api/verification/submit` | ✅ Zod-validated. |
| `/api/campaigns/{flag,reports,views}` | 🟡 Lower-risk; confirm auth/validation + rate-limit on `flag` (spam vector). |
| Service role | ✅ `createAdminClient()` is server-only (documented), never imported into client components. |

## 3. Webhook security
| Webhook | Finding |
|---|---|
| `POST /api/push/notify` | ✅ Shared-secret `x-webhook-secret`; 503 if unset, 401 on mismatch; always 200 otherwise (no retry storm). 🟡 Uses `!==` (not constant-time) — recommend `crypto.timingSafeEqual`. |
| `POST /api/payments/webhook` | ✅ Delegates to `provider.verifyWebhook()` (signature verification) for real gateways; returns 501 for the manual provider (no unsigned completion path). |

## 4. Share-tracking abuse
🟡 **Low severity.** `campaign_shares` allows anonymous INSERT (CHECK restricts
`source` to the known set only). A script could inflate share counts. Impact is
**analytics-only** — there is **no client read** (`get_share_stats` is owner-only)
and no security/financial effect. Recommend (optional): IP rate-limit the insert
path or route it through a server endpoint with throttling.

## Findings & recommendations
| # | Severity | Item | Recommendation |
|---|---|---|---|
| S1 | 🟡 | Push webhook secret compare is not constant-time | Use `crypto.timingSafeEqual` over the header vs. env secret |
| S2 | 🟠 | Auth route rate-limiting unverified | Confirm `enforceRateLimit` wraps `/api/auth/login` + `/signup` |
| S3 | 🟡 | Share-count inflation | Rate-limit `campaign_shares` inserts (optional; analytics-only) |
| S4 | 🟡 | `flag` endpoint spam | Ensure rate-limit + auth on campaign flagging |
| — | ✅ | Privilege escalation | None found |
| — | ✅ | XSS | User content rendered as text; only JSON-LD uses `dangerouslySetInnerHTML` (controlled, serialized objects) |

## Operational reminders
- Secrets (`ONESIGNAL_REST_API_KEY`, `SUPABASE_WEBHOOK_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`) must be set server-side only — never `NEXT_PUBLIC_*`.
- Run all migrations (`docs/migration-status.md`) so RLS policies are actually
  active in production — unapplied RLS is the biggest real-world risk.
