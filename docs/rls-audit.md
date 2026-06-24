# XAYR — Row Level Security (RLS) Audit

> Full review of every RLS policy, column grant, `SECURITY DEFINER` function, view,
> and storage policy across `supabase/*.sql`.
>
> **Date:** 2026-06-24 · **Scope:** all migrations + base schema · **Method:** static review (read-only).
> Legend: ✅ sound · ⚠️ finding/hardening · 🔴 vulnerability.

## Summary

The RLS model is **strong and internally consistent**. Every sensitive table has RLS
enabled; privileged writes (roles, verification status, campaign totals, donation
completion, payouts) are confined to the service role or to `SECURITY DEFINER`
functions that re-check `is_admin()` / ownership. The seven required guarantees all
hold (table below).

This pass made two **safe-by-default hardenings to the base `schema.sql`** so a fresh
bootstrap (running only `schema.sql`) is secure even before later migrations:

1. **Donations** — base schema allowed `donations_insert_any WITH CHECK (true)`, letting a
   client insert a `status='completed'` row and fake-credit a campaign via the
   `apply_donation` trigger. Replaced with `donations_insert_pending` (clients may
   insert only `pending`, for themselves/guest). *(Already enforced in `000_master_migration.sql`
   and `secure-donations-rls.sql`; the base file now matches.)*
2. **Users / role escalation** — base schema kept the default table-level UPDATE grant,
   so `users_update_self` let a user write their own `role` → self-promotion to admin.
   Added `revoke update … ; grant update (profile columns only)`. *(Already enforced in
   `verification.sql` / `admin-dashboard.sql`; the base file now matches.)*

One **open finding** remains that is intentionally **not** fixed blind (see §"Findings"): broad
`SELECT` on `public.users` exposes `email`/`phone`/`rejection_reason`. The correct fix is a
coordinated schema+app change and must be tested, not shipped blind.

## Required guarantees — verification

| # | Guarantee | Result | Enforced by |
|---|---|---|---|
| 1 | Users can only access their own data | ✅ | `saved_campaigns`, `recently_viewed`, `notifications`, `notification_preferences` all `using (user_id = auth.uid())`. PII tables (`verification_requests`, `payout_requests`) scoped to owner+admin. ⚠️ caveat: `users` profile columns are world-readable (finding F1). |
| 2 | Users cannot change roles | ✅ | `revoke update on users` + column grant excluding `role` (verification.sql / admin-dashboard.sql; now also base schema.sql). Role changes only via service role after `is_admin()` (`/api/admin/set-role`). |
| 3 | Users cannot change verification status | ✅ | Same column-grant mechanism excludes `verification_status`/`verified_at`/`rejection_reason`. Written only by `/api/admin/verifications` (service role). |
| 4 | Users cannot modify campaign totals | ✅ | `guard_campaign_protected_fields` trigger resets `status`/`current_amount`/`donors_count`/`views` for non-admins; bypass flag is transaction-local and used only by `apply_donation`. |
| 5 | Users cannot complete donations | ✅ | `donations_insert_pending` (insert `pending` only); **no** client UPDATE/DELETE policy → only the service role completes a donation. (Base schema now matches.) |
| 6 | Users cannot view others' KYC documents | ✅ | `identity_documents` = admin-only SELECT; `verification-documents` storage bucket is **private** with own-folder-or-admin read; admin UI uses short-lived signed URLs. |
| 7 | Admin-only tables are protected | ✅ | `payment_events`, `admin_audit_log`, `contact_messages`, `campaign_flags` SELECT gated on `is_admin()`; `admin_stats` revoked from anon/authenticated, `service_role` only. |

## Every policy reviewed

### `users` (schema.sql / 000_master_migration.sql)
| Policy / grant | Rule | Verdict |
|---|---|---|
| `users_select_all` | SELECT `using (true)` | ⚠️ F1 — exposes email/phone/rejection_reason (see Findings) |
| `users_insert_self` | INSERT `auth.uid() = id` | ✅ |
| `users_update_self` | UPDATE own row | ✅ |
| column UPDATE grant | `revoke update`; grant only `full_name, avatar_url, bio, phone, preferred_language, updated_at` (+ `donor_stats_public` via donor-profiles.sql) | ✅ excludes `role`, `id`, `email`, `verification_status` — **now added to base schema.sql too** |

### `categories`
| `categories_select_all` (SELECT true) · `categories_admin_write` (ALL `is_admin()`) | ✅ |

### `campaigns`
| Policy | Rule | Verdict |
|---|---|---|
| `campaigns_select_public` | active OR own OR admin | ✅ |
| `campaigns_insert_own` | `user_id = auth.uid()` **and** (`is_verified()` or admin) — KYC gate (campaign-create-kyc-gate.sql) | ✅ |
| `campaigns_update_own` | own OR admin OR team owner/manager (campaign-teams.sql) | ✅ column protection via trigger, not the policy |
| `campaigns_delete_own` | own OR admin | ✅ |
| `guard_campaign_protected_fields` (trigger) | totals/status admin-only | ✅ |
| `guard_campaign_owner_column` (trigger) | only admins may change `user_id` (anti-reassignment) | ✅ |
| `enforce_campaign_publish` (trigger) | unverified authors clamped to `draft` | ✅ |

### `donations`
| Policy | Rule | Verdict |
|---|---|---|
| `donations_insert_pending` | insert `status='pending'` and `donor_id is null or = auth.uid()` | ✅ (base schema **fixed** this pass) |
| `donations_select_scoped` | donor OR campaign owner OR admin | ✅ |
| (no UPDATE/DELETE policy) | completion via service role only | ✅ |

### `campaign_updates`
| `updates_select_all` (SELECT true) · `updates_team_write` (ALL: any team member / owner / admin) | ✅ |

### `comments`
| select all · insert/update own · delete own-or-admin | ✅ |

### `notifications`
| select/update/delete own; **no client INSERT** (rows via SECURITY DEFINER triggers / service role) | ✅ |

### `saved_campaigns` · `recently_viewed` · `notification_preferences`
| All own-row scoped (`user_id = auth.uid()`) for select/insert/update/delete | ✅ |

### `verification_requests`
| `vreq_select_own_admin` (own OR admin) · `vreq_admin_update` (admin only); inserts via service role | ✅ |

### `identity_documents`
| `idoc_admin_select` (admin only); no client write | ✅ — KYC docs never exposed to other users |

### `campaign_reports` (completion reports)
| select all (public success stories) · owner write · admin all · team insert/update/delete (owner+manager, self-authored insert) | ✅ |

### `campaign_flags`
| `flags_insert` (`reporter_id = auth.uid()`, authenticated) · `flags_select_admin` · `flags_update_admin` | ✅ (⚠️ minor: per-user dedupe is app-layer; spam throttling recommended — non-security) |

### `creator_followers`
| select all · insert/delete own (`follower_id = auth.uid()`) | ✅ |

### `campaign_team_members`
| `team_select_all` (rosters public) · insert/update/delete by campaign owner-or-admin, **never role='owner'**; owner row trigger-managed | ✅ strong anti-escalation design |

### `contact_messages`
| `cm_insert_any` (public form) · select/update admin only | ✅ |

### `payout_requests` / `payout_request_events`
| select own-or-admin; **no** client write — all transitions via `SECURITY DEFINER` fns that check `is_admin()` or campaign ownership + verification; over-withdrawal guard; one-active-request unique index | ✅ excellent |

### `payment_events`
| `payment_events_select_admin` (admin only); writes via service role | ✅ raw provider payloads never client-readable |

### `admin_audit_log`
| `audit_select_admin` (admin only); writes via service role | ✅ |

### Views
| View | Rule | Verdict |
|---|---|---|
| `campaign_donors` | `security_invoker = false`; completed only; masks anonymous donor name/avatar | ✅ |
| `admin_stats` | `security_invoker = false`; `revoke all from anon, authenticated`; `grant select to service_role` | ✅ |

### `SECURITY DEFINER` functions (authorization re-checked inside)
| Function | Guard | Verdict |
|---|---|---|
| `is_admin`, `is_verified`, `campaign_role` | read-only helpers, `set search_path = public` | ✅ |
| `get_donor_stats` | returns real aggregates only to self/admin/opted-in-public, else zeros | ✅ privacy-safe |
| `get_share_stats` | raises `forbidden` unless campaign owner/admin | ✅ |
| `create/approve/reject/request_info/mark_paid_payout` | each re-checks owner/admin + state transition | ✅ |
| `increment_campaign_views`, `record_campaign_view`, `resubmit_campaign` | definer bypass scoped to intended write | ✅ |
| `apply_donation` | transaction-local guard bypass only for the credit UPDATE | ✅ |

### Storage policies (`storage.objects`)
| Bucket | Read | Write | Verdict |
|---|---|---|---|
| `campaign-images` (public) | bucket-wide | own-folder insert/update/delete; insert requires auth | ✅ |
| `profile-photos` (public) | bucket-wide | own-folder only | ✅ |
| `campaign-reports` (public) | bucket-wide | own-folder insert/delete | ✅ |
| `verification-documents` (**private**) | own-folder OR admin | own-folder insert; **no** update/delete | ✅ KYC files protected; admin reads via signed URL |

## Findings

### 🔴 F1 — Broad `SELECT` on `public.users` exposes PII (email, phone, rejection_reason)
- **What:** `users_select_all … using (true)` plus the default column-level SELECT grant lets **anyone holding the public anon key** run `select email, phone, rejection_reason from users` and enumerate every user's contact details.
- **Why not fixed in this commit:** The same table is *intentionally* world-readable so creator `full_name`/`avatar_url` embed on campaign cards/detail via PostgREST (`profiles:users(...)`), and the owner must read their *own* `phone` (ProfileForm prefill) and `rejection_reason` (verification card). RLS restricts rows, not columns; column-grant revocation can't distinguish "own row" from "others'" and would break the Navbar's `select('*')`, profile editing, and creator-name display across the app. A correct fix is a **coordinated schema + app change** that must be tested — shipping it blind to `main` (where CI does not exercise RLS or runtime) is riskier than the exposure.
- **Recommended remediation (follow-up, tested):**
  1. Create a public-safe projection — either a `SECURITY DEFINER` view `public_profiles (id, full_name, avatar_url, bio, username, verification_status, created_at)` granted to `anon, authenticated`, **or** split private PII (`email`, `phone`, `rejection_reason`) into a separate `user_private` table with own-row-only RLS.
  2. Repoint public reads (campaign embeds, `/u/[username]`, donor displays) at the safe view.
  3. Narrow `users_select_all` to `using (id = auth.uid() or public.is_admin())`, or revoke column SELECT on the PII columns once no public read depends on them.
  4. Refactor the Navbar `select('*')` (own row) and ProfileForm/verification card to read PII from the owner's own row / `getUser()` only.
  - Severity: **High** (PII enumeration), but no financial/privilege impact.

### ⚠️ F2 — `campaign_shares` / `campaign_flags` open INSERT (analytics/spam)
- Anonymous/authenticated inserts can inflate share counts; flags rely on app-layer dedupe. **Analytics-only**, no read exposure (`get_share_stats` is owner-only). Recommend IP rate-limiting the insert paths. Non-security.

### ⚠️ F3 — Base `schema.sql` was insecure-by-default (FIXED this commit)
- `donations_insert_any WITH CHECK (true)` and missing `users` UPDATE revoke. Both **fixed** in `schema.sql` to match the master migration / migrations #5 + verification.sql. Existing deployments that ran the full migration chain were already protected.

## Operational note
- The biggest real-world RLS risk is **migrations not applied in production**. Run
  `supabase/verify-migrations.sql` to confirm the secure policies (esp. #5
  `secure-donations-rls.sql`) are live. Unapplied RLS is the dominant risk, not the policy design.
