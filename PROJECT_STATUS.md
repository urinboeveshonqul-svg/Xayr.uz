# XAYR Project Status

> **Single source of truth for the XAYR platform.**
> Generated from a direct read of the codebase. Reflects only what is actually
> implemented — no aspirational or invented features.
>
> **Last synced:** 2026-06-30
> **Branch:** feat/payout-accounts · **Latest commit at sync:** `5667c21` (financial snapshots #46, live on main) + verified Success Stories (approved completion report required; no migration)
>
> ⚠️ **Maintenance rule:** update this file whenever a feature, migration, route,
> env var, or completion estimate changes. See [Maintenance Rules](#maintenance-rules) at the end.

---

## 1. Project Overview

| Field | Value |
|---|---|
| **Project name** | XAYR (`xayr-platform`, v0.1.0) |
| **Purpose** | Crowdfunding / charity platform — verified creators publish campaigns; donors give; creators report outcomes and request payouts. |
| **Tech stack** | Next.js 15.1 (App Router, RSC), React 18, TypeScript 5, Tailwind CSS 3.4, Zod, react-hook-form, react-hot-toast, lucide-react, date-fns, next-themes |
| **Target country** | Uzbekistan (currency: UZS / so'm; default language Uzbek; payment gateways scoped to Click & Payme) |
| **Hosting / Deployment** | Vercel (`vercel.json` framework: nextjs) |
| **Database** | Supabase PostgreSQL 15 (RLS-enforced) |
| **Authentication** | Supabase Auth — email/password + Google OAuth (PKCE), email confirmation gate |
| **Storage** | Supabase Storage — buckets: `campaign-images` (public), `profile-photos` (public), `campaign-reports` (public), `verification-documents` (private) |
| **Rate limiting** | Upstash Redis (`@upstash/ratelimit`), fail-open |
| **Push** | OneSignal (browser web push) |
| **i18n** | Custom locale routing (`/[locale]/…`) — uz, ru, en |

---

## 2. Current Completion

Estimates are based on implemented code, not roadmap intent. A "code-complete but
operationally blocked" system (e.g. payments, push) is scored on what exists in the repo.

| Area | Completion | Notes |
|---|---|---|
| **Overall Platform** | **~74%** | Feature-rich and polished; blocked from real-money operation by the payment gateway gap. |
| Frontend | 95% | Full page set, components, responsive, theming, i18n. |
| Backend (API routes) | 90% | 20 routes, all validated + RBAC; payment provider impl missing. |
| Database | 95% | Schema + 46 migrations; live application unverified. |
| Security | 88% | Strong model; live RLS unverified + minor hardening items. |
| Mobile | 95% | Bottom nav, touch targets, responsive throughout, PWA manifest. |
| SEO | 95% | Metadata, OG images, JSON-LD, sitemap, robots, canonical/hreflang. |
| **Payment System** | **25%** | Abstraction/webhook/idempotency built; **no real gateway** — donations never complete automatically. |
| Notifications (in-app) | 95% | Trigger-driven, complete. |
| Push notifications | 80% (code) | Code-complete; requires OneSignal + Supabase webhook config to go live. |
| Admin Dashboard | 90% | Full surface (stats, campaigns, donations, flags, users, verifications, payouts, messages). |
| Localization | 95% | 3 languages, parity maintained (1305 lines each). |
| Analytics | 60% | Per-campaign creator analytics only; no platform product analytics. |
| Testing / CI | 35% | Build + typecheck CI; **no automated tests**, no lockfile. |

---

## 3. Completed Features

### Authentication
- **What:** Email/password + username login, Google OAuth, server-side signup, email confirmation, password reset/forgot.
- **Where:** `app/api/auth/{login,signup,username-available}/route.ts`, `app/auth/callback/route.ts`, `components/auth/*`, `app/[locale]/auth/*`, `middleware.ts` (session refresh, fail-open).
- **Status:** ✅ Complete. Login accepts email OR username (resolved via service role); rate-limited; anti-enumeration messaging. Google sign-in maps name/picture into the profile via `handle_new_user`.

### User Profiles
- **What:** Editable profile (full name, bio, phone, avatar, preferred language), public profile page, donor stats with privacy toggle.
- **Where:** `app/[locale]/profile/*`, `app/[locale]/u/[username]/page.tsx`, `components/profile/*` (`ProfileForm`, `AvatarUpload`, `UsernameSettings`, `DonorPrivacyToggle`, `VerificationStatusCard`, `FollowButton`).
- **Status:** ✅ Complete.

### KYC (Identity Verification)
- **What:** Multi-step wizard; uploads ID front/back + selfie to a private bucket; admin review via short-lived signed URLs; approve/reject with reason; status mirrored onto the user row.
- **Where:** `components/verification/VerificationWizard.tsx`, `app/api/verification/submit/route.ts`, `app/api/admin/verifications/route.ts`, `app/[locale]/admin/verifications/page.tsx`, `lib/kyc.ts`. Tables: `verification_requests`, `identity_documents`.
- **Status:** ✅ Complete. Document storage paths are validated to live under the user's own folder.

### Campaigns (Creation & Management)
- **What:** Create/edit campaigns (title, description, story, goal, category, images, urgent flag, deadline, location), draft→pending→active lifecycle, resubmit after rejection, owner-only field editing.
- **Where:** `app/[locale]/campaigns/{create,[slug],[slug]/edit}/*`, `components/campaigns/{CreateCampaignForm,EditCampaignForm,CampaignDetail,CampaignKycGate}.tsx`. Protected columns (`status`, `current_amount`, `donors_count`, `views`) enforced by `guard_campaign_protected_fields` trigger.
- **Status:** ✅ Complete. Creation is gated on `verification_status='verified'` (KYC) at the RLS layer (`campaign-create-kyc-gate.sql`).

### Campaign Expiration & Archive
- **What:** At its deadline a campaign is auto-archived — `funded` (goal reached) or `expired` (not). Archived campaigns drop out of all active discovery (homepage/featured/trending/listings/category/search/recommended — every one pins `status='active'`) but **keep their public URL + SEO** (RLS widened so `completed`/`expired`/`funded` stay anon-readable; detail pages stay indexable). The detail page hides Donate and shows **"Successfully Funded"** / **"Campaign Ended"** + "This campaign has ended."; the donations API also rejects a past deadline. Owner dashboard + admin manager gain `expired`/`funded`/`cancelled` filters (Campaign History). Owner is notified on expiry/funding. Donations, analytics, and history are never deleted.
- **Extension:** owner of an **expired, under-goal** campaign requests a new deadline + **reason** (category: treatment/construction/emergency/other; KYC required, ≤30 days out, ≤2 extensions, one pending at a time) from the dashboard. **A request never reactivates the campaign** — it stays `expired` (hidden from all listings, donations off) and shows "Extension request under review."; the owner may **cancel** a pending request (`cancel_campaign_extension` → `cancelled`) and not submit another while one is pending. Admin reviews under **/admin/extensions** (shows raised/goal/remaining, previous-extension count, requested additional days, reason + request date) → Approve reactivates the campaign (`active` + new deadline, restoring discovery + donations) / Reject keeps it expired (owner sees the reason and may re-request under the limit); **owner AND previous donors** are notified on approve, owner on reject. Request status set: `pending`/`approved`/`rejected`/`cancelled`. All writes via SECURITY DEFINER RPCs; the never-deleted request row is the audit trail (user + time + requested date + duration + reason + reviewer + decision date + rejection reason), visible to the owner (dashboard history) and admins.
- **Transparency:** an **"Extended" badge** shows on the campaign card + detail when `extension_count > 0`; the detail page renders a public **Campaign Timeline** (Created → Extended (date)… → terminal) from `get_campaign_extension_history()` (dates only — the reason is never exposed publicly).
- **Manual close & funded:** owner can **Close** a goal-reached active campaign (`close_campaign()` → `funded`); funded-before-deadline stays active until the deadline or manual close.
- **Analytics:** owner analytics shows original vs current end date, # extensions, days extended, and donations **before vs after** the original deadline. All analytics/donations/payout records are immutable (no deletion).
- **Personal collections:** expired/funded campaigns are **kept** in Saved Campaigns and Recently Viewed (no status filter; RLS allows the public archive states). The shared `CampaignCard` renders an **Expired/Funded badge + end date** and swaps the Donate CTA for a disabled "Expired"/"Funded" pill (`aria-disabled` + `aria-label` "no longer accepting donations" — reason never hidden); the card still links to the page so users can read the story/updates/donor history and share. The detail page shows **"This campaign is no longer accepting donations."** Active discovery still excludes archived campaigns (status-pinned).
- **Reactivation sync:** approval is an in-place `UPDATE` (same id/slug; donations/comments/updates/saved/recently_viewed/followers preserved), so every dynamically-rendered surface (detail, listings, search, Saved, Recently Viewed, dashboards, related) shows the restored `active` state on next load with no user action — the card/detail re-derive `ended` from status+deadline, so the Donate button / countdown / remaining days come back and the Expired badge disappears automatically. The **only cached surface** is the ISR homepage (`revalidate = 60`, featured/trending); admin approve/reject now go through `app/api/admin/extensions/route.ts`, which calls the RPC and `revalidatePath('/[locale]')` on approve so the reactivated campaign rejoins featured/trending immediately. Reactivation happens **only** via `approve_campaign_extension` (admin-gated) — a deadline edit alone never flips status.
- **Where:** `supabase/campaign-expiration.sql` (#41) + `campaign-extensions.sql` (#42, self-contained: table + reason + original_deadline + all RPCs); `app/api/cron/expire-campaigns/route.ts` + `vercel.json` cron; `lib/utils.ts`; `components/campaigns/{CampaignDetail,CampaignCard,CampaignTimeline}.tsx`; `app/[locale]/campaigns/[slug]/{page,analytics/page}.tsx`; `app/api/donations/route.ts`; `components/profile/MyCampaigns.tsx` (history filters + extend modal + close); `components/admin/{AdminCampaignsManager,AdminExtensions}.tsx` + `app/[locale]/admin/extensions/page.tsx`.
- **Status:** ✅ Code-complete (pending migrations #41–#42 applied + `CRON_SECRET` set).

### Donations
- **What:** Donation modal with preset/custom amounts, optional message, and a 3-way **name display** (Display my name / First name only / Anonymous). Works for **guests and registered users** on the same campaign page. **Guests** provide name + email (+ optional phone) and pass **Turnstile**; logged-in donors reuse their profile (linked via `donor_id`) and skip those fields. Server creates a **pending** record; client can never set status. Anonymity is derived server-side from the display choice. Guest contact is PII (admin/owner-only via RLS); the public donor feed shows only the chosen display name (`campaign_donors` view handles guest + registered, first-word, and anonymous). The payment-success page shows an on-screen **receipt** (amount/campaign/transaction ref/date) and offers guests a **"Create a XAYR account"** CTA (never forced). Admin donations view distinguishes **guest vs registered**, shows the real name/email/phone even for anonymous donations, and filters by donor type; owner analytics shows a **donor-type breakdown** (total / registered / guest / anonymous).
- **Where:** `components/donations/DonationForm.tsx`, `app/api/donations/route.ts` (Turnstile + guest validation), `components/payments/PaymentSuccessView.tsx` (receipt + account CTA), `components/admin/AdminDonationsReconciliation.tsx` + `app/[locale]/admin/donations/page.tsx` (donor type/contact/filter), `app/[locale]/campaigns/[slug]/analytics/page.tsx` (breakdown); migration `supabase/guest-donations.sql` (#44). Table: `donations` (+ `donor_name`/`donor_email`/`donor_phone`/`name_display`).
- **Status:** ✅ Guest-donation workflow complete (security: Turnstile + rate-limit + server-side validation; status never client-trusted). ⚠️ Still **no completion path** until a payment gateway is wired (see §11); **email** receipts need a transactional-email provider (not yet integrated) — the receipt is shown on-screen meanwhile.

### Notifications (in-app)
- **What:** Bell + notifications view; auto-generated on new donation, comment, campaign milestone, campaign status change, updates, completion reports, payout status, and verification decisions.
- **Where:** `components/notifications/{NotificationBell,NotificationsView}.tsx`, `app/[locale]/notifications/page.tsx`. DB triggers across multiple migrations. Table: `notifications`.
- **Status:** ✅ Complete.

### Push Notifications
- **What:** Browser web push via OneSignal; per-category preferences; Supabase DB-webhook mirrors new `notifications` rows to push.
- **Where:** `components/push/{OneSignalProvider,PushSettings}.tsx`, `lib/onesignal.ts`, `lib/push-client.ts`, `app/api/push/notify/route.ts`. Table: `notification_preferences`.
- **Status:** ⚠️ Code-complete; requires OneSignal app + Supabase webhook secret configuration to operate (see `docs/push-notifications-setup.md`).

### Sharing
- **What:** Share modal; share-event tracking per source feeding traffic-source analytics.
- **Where:** `components/campaigns/ShareModal.tsx`, `lib/share.ts`, `get_share_stats` RPC. Table: `campaign_shares`.
- **Status:** ✅ Complete (anonymous insert; analytics-only — see known issues).

### Analytics (creator-facing)
- **What:** Per-campaign analytics — views, donors, amount over time, traffic sources.
- **Where:** `app/[locale]/campaigns/[slug]/analytics/page.tsx`, `components/campaigns/CampaignAnalytics.tsx`, `get_share_stats`.
- **Status:** ⚠️ Per-campaign only; no platform-wide product analytics.

### Saved Campaigns (bookmarks)
- **What:** Save/unsave campaigns; saved list page.
- **Where:** `components/campaigns/SaveButton.tsx`, `lib/saved-campaigns.ts`, `app/[locale]/profile/saved/page.tsx`. Table: `saved_campaigns`.
- **Status:** ✅ Complete.

### Recently Viewed
- **What:** Per-user recently-viewed history (logged-in) + client-side recent strip on home.
- **Where:** `components/campaigns/{RecentlyViewed,ViewTracker}.tsx`, `lib/recently-viewed.ts`, `record_campaign_view` RPC. Table: `recently_viewed`.
- **Status:** ✅ Complete.

### Team Campaigns
- **What:** Multiple members per campaign with roles (owner / manager / editor); team-aware RLS; completion-report permissions extend to managers.
- **Where:** `components/campaigns/CampaignTeam.tsx`, `campaign_role` function. Table: `campaign_team_members`.
- **Status:** ✅ Complete.

### Reports (completion reports + abuse flags)
- **Completion reports (moderated, Phase 1):** Creator/manager submits a fund-usage **completion report** on a **completed** campaign — title, ≥200-char summary, **fund-usage breakdown** (category/description/amount, total ≤ total withdrawn), beneficiary status, milestone **timeline**, images/before-after/videos/documents. Reports are **admin-moderated**: a guard trigger forces submissions to `pending` (owners can't self-approve); admins **approve / request changes / reject** with feedback under **/admin/reports** (`review_completion_report`). Only **approved** reports are public (RLS); existing v1 reports were grandfathered as `approved`. The public report shows a **transparency block** (Funds Raised / Withdrawn / Reported / Completion Date / Verified) + "Remaining funds not yet reported" when reported < withdrawn, the breakdown, timeline, gallery, inline videos, and documents. Owner is notified on each decision; donors are notified **on approval** (was: on submit). `components/campaigns/{CompletionReportForm,CompletionReports}.tsx`, `components/admin/AdminReports.tsx`, `app/[locale]/admin/reports/page.tsx`, `app/api/campaigns/reports/route.ts`; migration `supabase/completion-reports-v2.sql` (#43). Table: `campaign_reports` (+ status/fund_breakdown/timeline/beneficiary/media/review columns). ✅ Phase 1 (pending #43 applied). ⏳ Phase 2: Verified-Completion trust badges + creator trust display + search filters + report analytics.
- **Abuse flags:** Authenticated users flag campaigns (fraud/misleading/spam/other); admin resolves. `components/campaigns/ReportCampaignButton.tsx`, `app/api/campaigns/flag/route.ts`, `components/admin/AdminCampaignFlags.tsx`. Table: `campaign_flags`. ✅ Complete.

### "Featured" / Homepage Curation
- **What:** The homepage shows the **first 3 active campaigns** (by recency) as "Featured" and the **top 8 by raised amount** as "Trending."
- **Where:** `app/[locale]/page.tsx` (`featured = campaigns.slice(0,3)`, `trending` sorted by `current_amount`).
- **Status:** ✅ Implemented as a **presentation layer only** — there is **no `is_featured` column or admin curation**. (Documented accurately to avoid implying a backed feature.)

### Success Stories (verified)
- **What:** A campaign appears as a Success Story **only** if ALL hold: goal reached (`current_amount >= goal_amount`), status `completed`/`funded`, and an **admin-approved completion report** exists. This excludes active/expired-under-goal/pending/draft/rejected/paused/cancelled campaigns and any campaign whose report is missing / pending / rejected. Surfaces: homepage Success Stories section (verified-only cards: **Report-Approved badge**, amount raised, goal, completion date, category, cover image, **View Completion Report** → `/campaigns/[slug]#completion-report`); a `/campaigns?filter=success` **Success Stories search filter** (server-side); creator profiles (include `funded`); and the public campaign page shows **"Successfully Completed"** (replacing the generic ended/funded notice) with a link to the report when an approved report exists. Sync is automatic — every surface derives live from `campaign_reports.status='approved'` + campaign status/goal, so approving/revoking a report adds/removes the campaign everywhere on next load (homepage within its ISR window).
- **Where:** `lib/success-stories.ts` (`getSuccessStories`, `getSuccessStoryIds` — the single qualification rule), `app/[locale]/page.tsx` (homepage section), `app/[locale]/campaigns/page.tsx` + `components/campaigns/CampaignFilters.tsx` (search filter), `components/campaigns/CampaignDetail.tsx` + `app/[locale]/campaigns/[slug]/page.tsx` (messaging + `#completion-report` anchor), `app/[locale]/u/[username]/page.tsx` (creator profile). Uses `dict.home.success*` / `dict.filters.successStories*` / `dict.detail.successCompleted*`.
- **Status:** ✅ Complete. **No migration** — reuses existing `campaign_reports.status` + campaign `status`/goal (no denormalized flag, no duplicated data); server-side filtering over the small approved-report set. Fixed the prior bug where the homepage listed *any* `status='completed'` campaign regardless of goal or report.

### Platform Fees — Mission & Transparency (`/fees`)
- **What:** The full mission/transparency explanation lives on the **Platform Fees page** (`/fees`), **not** the homepage — it was moved off the homepage so it no longer interrupts the donation flow or surfaces commissions to first-time visitors too early. `/fees` now covers: the **"Helping People Comes First"** mission (connect generous people with the individuals, families, and communities who need support; help people while keeping operations sustainable), a **"Why does XAYR charge a platform fee?"** section (donations go directly to the campaign organizer; any commission is used only to operate/improve XAYR), the cost-category checklist (payment processing, hosting, cloud infrastructure, security, fraud prevention, identity verification, customer support, platform maintenance/development), a sustainability note, and four transparency value cards (Mission First / Secure Donations / Verified Campaigns / Transparent Platform) — in the page's brand/dark design. The existing pricing cards + worked example remain (the **only** place a percentage appears). No nonprofit/legal claims. `/fees` is reachable from the footer **Support** group (alongside FAQ + Guide), so no main-nav clutter.
- **Where:** `app/[locale]/fees/page.tsx`; copy in `locales/{uz,ru,en}/common.json` (`transparency.*` retained/reused; `feeWhyTitle` added). The homepage (`app/[locale]/page.tsx`) no longer renders the section. The `statVerifiedCampaigns`/`statSuccessful`/`statRaised` labels are reused by the Trust modal (below).
- **Status:** ✅ Complete. Production build + typecheck pass locally.

### Trust & Transparency Modal ("Why Trust XAYR?")
- **What:** A small, secondary **🛡️ Why Trust XAYR?** pill below the hero (centered above the homepage statistics grid; **not** a primary CTA) opens a **trust & transparency modal** — centered dialog on desktop, **bottom-sheet on mobile** — without leaving the homepage. Seven sections (Verified Campaigns, Secure Donations, Transparent Withdrawals, Completion Reports, Platform Fees, Your Privacy, Community Safety), a **real-data** trust-indicator strip (verified campaigns, successful campaigns, total donations, registered users, total raised — each **hidden when 0**), and a CTA row (Help Center → `/guide`, Contact Support → `/contact`, Platform Fees → `/fees`). No fixed fee % shown — the Platform Fees section reuses `transparency.feeBody`/`feeItems`. Accessible: `role="dialog"`, `aria-modal`, labelled/described by title+subtitle, Esc-to-close, Tab focus-trap + focus restore, body scroll-lock. Reuses the ShareModal pattern (`animate-pop`, `items-end sm:items-center`, `rounded-t-3xl sm:rounded-3xl`).
- **Where:** `components/home/WhyTrustButton.tsx` (small trigger; **lazy-loads** the modal via `next/dynamic` `{ ssr:false }`, keeping its weight out of the homepage's initial JS), `components/home/WhyTrustModal.tsx` (the dialog), `app/[locale]/page.tsx` (`getPlatformStats` extended with `verifiedCampaigns`/`successfulCampaigns`/`registeredUsers`), `components/i18n/I18nProvider.tsx` (added `ta()` array-translation helper for bullet lists), copy in `locales/{uz,ru,en}/common.json` (`trust.*`).
- **Mobile (320–430px) hardening:** full-width bottom-sheet, `max-h-[90vh]`; body is `flex-1 min-h-0 overflow-y-auto overscroll-contain` so it scrolls **inside** the sheet (header/close pinned, page locked) — fixes content overflowing past the CTA; panel `overflow-hidden`; **drag-handle + swipe-down-to-close** (header-scoped, no scroll conflict); trigger button `whitespace-nowrap` + `min-h-[44px]` (44px touch target); single-column cards, `px-4`/`p-4` mobile padding, reduced heading/number sizes, full-width CTA buttons. Desktop (`sm:`) layout unchanged.
- **Status:** ✅ Complete. Production build + typecheck pass locally.

### Creator Profiles & Following
- **What:** Public creator profile (`/u/[username]`) with Person JSON-LD; follow creators; followers notified on new campaign launch.
- **Where:** `app/[locale]/u/[username]/page.tsx`, `components/profile/FollowButton.tsx`, `notify_followers_on_campaign_launch`. Table: `creator_followers`.
- **Status:** ✅ Complete.

### Usernames
- **What:** Unique usernames with reserved list, strict format rules (no leading/trailing/consecutive dots, no `__`), live availability check, change-username RPC, auto-generation + OAuth auto-assign.
- **Where:** `lib/username.ts`, `lib/username-generator.ts`, `app/api/auth/username-available/route.ts`, RPCs `is_username_available` / `change_username` / `generate_username`.
- **Status:** ✅ Complete.

### Search
- **What:** Postgres-side search over title/description/location + creator name (resolved to user_ids), with category/urgent filters, sort (newest, most_raised, most_donors, deadline), pagination. Trigram indexes back it.
- **Where:** `app/[locale]/campaigns/page.tsx`, `components/campaigns/{CampaignFilters,CampaignGrid,Pagination}.tsx`.
- **Status:** ⚠️ Functional `ilike`-based search; not fuzzy/ranked full-text.

### SEO
- **What:** Dynamic metadata, canonical + hreflang (uz/ru/en + x-default), dynamic per-campaign OG images, JSON-LD (Organization, WebSite+SearchAction, BreadcrumbList, WebPage, DonateAction, Person, FAQPage), dynamic sitemap with image entries, robots.
- **Where:** `lib/seo.ts`, `lib/campaign-jsonld.ts`, `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx`, `app/[locale]/campaigns/[slug]/opengraph-image.tsx`, `app/manifest.ts`.
- **Status:** ✅ Complete and strong.

### Admin
- **What:** Dashboard with stats; manage campaigns, reconcile donations, resolve flags, manage users + roles, review verifications, manage payouts, read contact messages.
- **Where:** `app/[locale]/admin/*`, `components/admin/*`, `app/api/admin/{set-role,verifications}/route.ts`, `admin_stats` view.
- **Status:** ✅ Complete. Rate-limited at the middleware layer; RBAC re-verified server-side on each route.

### Payouts
- **What:** Creator requests a withdrawal (bank/card) against available balance; 3% platform commission computed; admin state machine (`pending_review → approved → paid`, plus `info_requested`/`rejected`/`cancelled`); full event log. The whole flow lives on a **dedicated Withdrawal page** (`/[locale]/campaigns/[slug]/withdraw`) — payout information appears ONLY here, never on the Profile or Analytics pages. Order on the page: **Available Balance → Saved Payout Information (or the form when missing) → Withdrawal Request Form → Withdrawal History**. No account yet → the `PayoutAccountForm` shows inline first; account exists → a **read-only masked card** (legal name, phone, card type, masked card `8600 **** **** 9012`, cardholder, bank) with an inline **Edit** (same form, no page change). Saving reveals the card and enables the withdraw button; the request snapshots the account server-side, so card details are never re-entered. The full card number is masked for creators (BIN + last 4) and never serialized to the page payload — the unmasked record is fetched on demand (RLS owner-only) just for the edit form; admins still see the full PAN in the admin payout dashboard. The dashboard "Withdraw" button and an Analytics-page button both link to `/withdraw`.
- **Where:** Page `app/[locale]/campaigns/[slug]/withdraw/page.tsx` (builds the masked projection + balance) renders `components/campaigns/CampaignPayouts.tsx`, which hosts the inline `components/profile/PayoutAccountForm.tsx` via its `embedded`/`onSaved`/`onCancel` props. Admin side: `components/admin/AdminPayouts.tsx`, `app/[locale]/admin/payouts/page.tsx`. Masking helper `maskCardDisplay` in `lib/payout.ts`. RPCs: `create_payout_request`, `approve_payout_request`, `reject_payout_request`, `request_payout_info`, `mark_payout_paid`, `campaign_available_balance`. Tables: `payout_requests`, `payout_request_events`, `payout_accounts`.
- **Status:** ✅ Code-complete; ⚠️ functionally meaningless until donations actually complete (depends on payments).

### Financial Transparency & Ledger
- **What:** End-to-end financial tracking — every money movement is auto-recorded in an **immutable, append-only ledger** (`financial_ledger`: donation/refund/platform_fee/provider_fee/withdrawal/adjustment/admin_correction; signed amount; UPDATE/DELETE blocked by a guard trigger; `source_key` dedupe). Triggers record entries from `donations` (completed → donation, un-complete → refund) and `payout_requests` (paid → withdrawal + platform_fee); the migration backfills existing data. **Admin Financial Dashboard** (`/admin/finance`) shows the full metric set (total donations, net-to-creators, withdrawn, platform/provider fees, refunded, available-for-withdrawal, pending withdrawals/payments, avg/largest, # donations) + today/week/month/year windows + a **Financial Integrity Warning** (`check_financial_integrity()` flags campaigns whose books don't reconcile) + recent ledger + **CSV export** (`/api/admin/finance/export`). **Public Transparency page** (`/transparency`, ISR) shows aggregated, PII-free stats (`public_financial_stats()`: total donations, raised, delivered, successful/active/verified campaigns, users). **Per-campaign financial breakdown + money-flow timeline** on the owner withdrawal page (goal/raised/platform fee/provider fee/net/withdrawn/available/pending/remaining, computed from tamper-proof balances). Admin manual adjustments require admin + reason and are logged to `admin_audit_log` (`record_ledger_adjustment`). All aggregation runs in Postgres (`financial_summary` view, RPCs) — no donation-table scan in app code; fetchers fail closed to safe zeros.
- **Where:** `supabase/financial-ledger.sql` (#45), `lib/finance.ts`, `app/[locale]/admin/finance/page.tsx`, `app/api/admin/finance/export/route.ts`, `app/[locale]/transparency/page.tsx`, `components/campaigns/CampaignFinancials.tsx` (+ `app/[locale]/campaigns/[slug]/withdraw/page.tsx`), `components/admin/AdminNav.tsx` + `components/layout/Footer.tsx` (nav links), `types/index.ts`, `locales/{uz,ru,en}/common.json` (`fin.*`, `transparencyPage.*`, `campaignFinance.*`).
- **Status:** ✅ #45 live on `main` (`bd7189d`). **#46 (`financial-snapshots.sql`) adds:** daily `financial_snapshots` + idempotent generator + Vercel cron (`/api/cron/financial-snapshot`, reuses `CRON_SECRET`); ledger extension (`user_id`/`reference_id`, granular withdrawal-lifecycle + chargeback types); `reconciliation_report()`; **monthly money-flow charts** (admin + public, dependency-free inline SVG); **period tabs** (Today/Week/Month/Year/All-Time); **Excel** (`?format=xls`) + **PDF** (print-styled `/admin/finance/report`) export; avg/largest on `/transparency`. ⚠️ **Pending migration #46 applied in Supabase** (charts/snapshot cron need it; everything else degrades to safe zeros). ⏳ Remaining: provider-fee (no gateway → 0), advanced admin filters (campaign/user/provider dropdowns), one-click server-generated PDF (print view shipped).

### Contact
- **What:** Public contact form storing messages; admin inbox with read state.
- **Where:** `components/contact/ContactForm.tsx`, `app/[locale]/contact/page.tsx`, `components/admin/AdminMessages.tsx`. Table: `contact_messages`.
- **Status:** ✅ Stored + readable; ⚠️ no email reply mechanism.

### Mobile
- **What:** Bottom navigation, 48px touch targets, responsive Tailwind layouts, sticky donate actions on campaign detail, PWA manifest.
- **Where:** `components/layout/BottomNav.tsx`, `app/manifest.ts`, responsive classes throughout.
- **Status:** ✅ Complete.

### Performance
- **What:** Single paginated indexed listing query, `force-dynamic` only where required, ISR (`revalidate=60`) on home, lazy dictionary import, Next/Image with remote allowlist, trigram + composite indexes.
- **Where:** `app/[locale]/campaigns/page.tsx`, `app/[locale]/page.tsx`, `supabase/optimize-campaign-indexes.sql`, `next.config.mjs`.
- **Status:** ✅ Solid for current scale.

### Legal / Static
- Privacy, terms, cookies, security, fees, FAQ, guide pages under `app/[locale]/*` with `components/legal/LegalDocument.tsx` and `components/faq/FaqList.tsx`. ✅ Present.

---

## 4. Features In Progress

| System | Exists | Missing | Remaining work |
|---|---|---|---|
| **Payment gateway** | Provider abstraction, webhook endpoint, idempotency dedupe, amount/currency verification, `payment_events` audit, `manual` provider | A real provider (Click/Payme) implementing `createPayment` + `verifyWebhook` | Implement one provider, register it, sandbox-test signature + webhook, wire method selection into `DonationForm`. |
| **Push notifications** | Full client + server code, preferences table, webhook handler | Live OneSignal app + Supabase DB-webhook config | Configure dashboards; verify end-to-end delivery. |
| **Analytics** | Per-campaign creator analytics | Platform-wide product analytics | Add Plausible/PostHog (or similar) + an admin analytics view. |
| **Search** | `ilike` + filters + trigram indexes | Ranked/fuzzy full-text | Add `tsvector` column + ranking, or typo tolerance. |
| **Refunds** | `refunded` status in enum | No flow/UI/trigger | Build refund handling once a gateway exists. |
| **Email** | Supabase Auth transactional emails only | Receipts, payout confirmations, contact replies | Integrate a transactional email provider. |

---

## 5. Planned Features

### High Priority
1. Live Click **or** Payme payment integration (unblocks the whole money flow).
2. Verify + apply all DB migrations to production; record live status.
3. Transactional email (donation receipts, payout confirmations, contact replies).
4. Automated tests (payment idempotency, RLS, donation→credit trigger) + committed lockfile.

### Medium Priority
5. Platform-level analytics + admin analytics dashboard.
6. Refund flow (status, trigger, admin UI).
7. Full-text/fuzzy search upgrade.
8. ~~Error monitoring (Sentry)~~ ✅ done — structured logging still pending.
9. Constant-time webhook secret comparison + share/flag insert rate-limiting.

### Future Ideas
10. Real admin-curated featured campaigns (`is_featured` column + admin control).
11. Recurring/subscription donations.
12. Campaign comments moderation tooling.
13. Multi-sitemap index when catalog approaches scale limits.
14. Donation receipt / "your impact" downloadable PDF.

---

## 6. Database

PostgreSQL 15 on Supabase. Every base table has **RLS enabled**. `updated_at` is
maintained by `set_updated_at()` triggers where present.

### Tables

| Table | Purpose | Key relationships | Notable RLS / triggers |
|---|---|---|---|
| `users` | Public profile (1:1 with `auth.users`) | `id → auth.users` | Select all; insert/update self only. Column-level grants exclude `role`/`verification_status`. `handle_new_user` populates on signup. |
| `categories` | Campaign categories (3-language labels) | referenced by `campaigns` | Select all; admin-only write. Seeded with 8 categories. |
| `campaigns` | Fundraising campaigns | `user_id → users`, `category_id → categories` | Select active/own/admin; insert own (KYC-gated); update own/admin. `guard_campaign_protected_fields` blocks owner edits to status/totals/views. |
| `donations` | Donation/transaction records | `campaign_id → campaigns`, `donor_id → users` (nullable = guest) | Insert restricted to `pending` (post-migration #5); select scoped to donor/owner/admin. `apply_donation` credits campaign on completion. `payment_ref` UNIQUE (migration #38). |
| `campaign_updates` | Creator progress updates (+ images/documents) | `campaign_id`, `user_id` | Select all; owner write. `notify_donors_on_update`. |
| `comments` | Threaded comments | `campaign_id`, `user_id`, `parent_id (self)` | Select all; insert/update own; delete own/admin. `notify_on_comment`. |
| `notifications` | In-app notifications | `user_id → users` | No client insert (trigger/service-role only); select/update/delete own. |
| `saved_campaigns` | Bookmarks | `user_id`, `campaign_id` (unique pair) | Own-row only. |
| `recently_viewed` | Per-user view history | `user_id`, `campaign_id` | Own-row only; deduped/pruned in RPC. |
| `campaign_reports` | Completion reports | `campaign_id`, `user_id` | Owner/manager write on completed campaigns; select all. `notify_donors_on_report`. |
| `campaign_flags` | Abuse reports | `campaign_id`, `reporter_id → users` | Authenticated insert; admin resolve. |
| `creator_followers` | Follow relationships | `follower_id`, `creator_id` | Own-row scoped. `notify_followers_on_campaign_launch`. |
| `campaign_team_members` | Team roles | `campaign_id`, `user_id` | Team-aware policies; `campaign_role` helper. |
| `contact_messages` | Contact form inbox | — | Public insert; admin read/update. |
| `admin_audit_log` | Admin action log (scaffolding) | `admin_id → users` | Admin-only. **Currently unused** (manual donation tool removed). |
| `payment_events` | Webhook audit / idempotency / reconciliation | `donation_id → donations` | Admin-only read; written by service role. `provider_event_id` dedupe. |
| `campaign_shares` | Share tracking | `campaign_id` | Anonymous insert (source CHECK-restricted); `get_share_stats` owner-only read. |
| `notification_preferences` | Push preference matrix | `user_id (PK)` | Own-row scoped. |
| `payout_requests` | Withdrawal requests | `campaign_id`, `user_id`, `reviewed_by` | Created/read via SECURITY DEFINER RPCs; state machine + 3% commission. |
| `payout_request_events` | Payout audit trail | `request_id → payout_requests` | Written by payout RPCs; `notify_on_payout_event`. |
| `verification_requests` | KYC submissions | `user_id`, `reviewed_by` | Insert/read own + admin; status drives publish gate. |
| `identity_documents` | KYC document pointers | `request_id`, `user_id` | Paths in private bucket; admin signed-URL access only. |

### Views
- `campaign_donors` — donor list for a campaign (respects anonymity).
- `admin_stats` — aggregate counts + `total_raised` + `revenue`.

### Functions (selected)
- `is_admin()`, `set_updated_at()`, `handle_new_user()`, `apply_donation()`, `notify_on_comment()`, `guard_campaign_protected_fields()` (core schema).
- `increment_campaign_views`, `record_campaign_view`, `resubmit_campaign`, `get_donor_stats`, `get_share_stats`, `is_username_available`, `change_username`, `generate_username`, `campaign_role`, `campaign_available_balance`.
- Payout RPCs: `create_payout_request`, `approve_payout_request`, `reject_payout_request`, `request_payout_info`, `mark_payout_paid`.
- Notification triggers: `notify_on_campaign_milestone`, `notify_donors_on_update`, `notify_donors_on_report`, `notify_on_payout_event`, `notify_followers_on_campaign_launch`, `notify_owner_on_campaign_status`, `notify_on_verification_decision`, `notify_on_donation_status`.

> **Verification:** Run `supabase/verify-migrations.sql` in the SQL Editor to confirm which objects actually exist in production (see §7).

---

## 7. Database Migrations

Migrations are **manual** (run by hand in the Supabase SQL Editor, in order). All
are idempotent. **Live status is `Unknown` until `verify-migrations.sql` is run** —
`docs/migration-status.md` lists every migration as unverified. Source of truth:
`supabase/MIGRATIONS.md`.

| # | File | Purpose | Live status | Depends on |
|---|---|---|---|---|
| 1 | `schema.sql` (or `000_master_migration.sql`) | Core tables, RLS, triggers, seed categories | Unknown | — |
| 2 | `verification.sql` | KYC tables, publish gate, `draft` status, column grants | Unknown | 1 |
| 3 | `add-user-verification-fields.sql` | `verified_at`, `rejection_reason` on users | Unknown | 2 |
| 4 | `remove-phone-verification.sql` | Drop SMS/OTP leftovers | Unknown | 2 |
| 5 | `secure-donations-rls.sql` | **Tamper-proof donations** (insert pending only) | Unknown | 1 — *security prerequisite for payouts* |
| 6 | `secure-campaign-fields-rls.sql` | Protected-field guard trigger | Unknown | 1 |
| 7 | `campaign-donors-view.sql` | `campaign_donors` view | Unknown | 1 |
| 8 | `campaign-completion-reports.sql` | Reports table + bucket | Unknown | 1 |
| 9 | `admin-dashboard.sql` | `admin_stats` view | Unknown | 1 |
| 10 | `optimize-campaign-indexes.sql` | Trigram + listing indexes | Unknown | 1 |
| 11 | `add-campaign-images.sql` | `campaigns.images[]` + bucket | Unknown | 1 |
| 12 | `add-preferred-language.sql` | `users.preferred_language` | Unknown | 1 |
| 13 | `campaign-flags.sql` | Flag/report-campaign table | Unknown | 1 |
| 14 | `donor-notifications.sql` | Donor notification triggers | Unknown | 1, 8 |
| 15 | `campaign-updates-attachments.sql` | Update images/documents | Unknown | 1 |
| 16 | `campaign-views.sql` | View-tracking RPCs | Unknown | 1 |
| 17 | `recently-viewed.sql` | Recently-viewed table | Unknown | 1 |
| 18 | `payouts.sql` | Payout tables + state machine | Unknown | 5 |
| 19 | `payout-notifications.sql` | Payout-status notifications | Unknown | 18 |
| 20 | `creator-followers.sql` | Followers + launch notifications | Unknown | 1 |
| 21 | `donor-profiles.sql` | Donor stats + privacy toggle (+ column grant) | Unknown | 1 |
| 22 | `profile-photos.sql` | Avatar bucket | Unknown | 1 |
| 23 | `campaign-teams.sql` | Team members + team-aware RLS | Unknown | 1 |
| 24 | `contact-messages.sql` | Contact inbox | Unknown | 1 |
| 25 | `campaign-resubmit.sql` | `resubmit_campaign` | Unknown | 2 |
| 26 | `payout-commission.sql` | 3% commission columns | Unknown | 18 |
| 27 | `google-oauth.sql` | OAuth profile creation (name/picture) | Unknown | 1 + dashboard config |
| 28 | `platform-notifications.sql` | Owner/verification decision notifications | Unknown | 1, 2 |
| 29 | `push-notifications.sql` | `notification_preferences` | Unknown | 1 + OneSignal/webhook config |
| 30 | `campaign-shares.sql` | Share tracking + `get_share_stats` | Unknown | 1 |
| 31 | `admin-donation-management.sql` | Donation-status notification trigger + `admin_audit_log` | Unknown | 1 |
| 32 | `admin-workflow.sql` | Campaign `rejection_reason` + `admin_stats.revenue` | Unknown | 9 |
| 33 | `email-verification-gate.sql` | Email-confirm publish gate | Unknown | 1 |
| 34 | `usernames.sql` | Usernames (column, RPCs, backfill) | Unknown | 1 |
| 35 | `usernames-rules.sql` | Stricter username rules | Unknown | 34 |
| 36 | `campaign-create-email-gate.sql` | Email-gated insert (superseded by #37) | Unknown | 33 |
| 37 | `campaign-create-kyc-gate.sql` | **KYC-gated** create/publish | Unknown | 2, 36 |
| 38 | `payment-foundation.sql` | `payment_ref` UNIQUE + `payment_events` | Unknown | 5 |
| 39 | `payment-refund-reversal.sql` | Refund safety — `apply_donation` reverses campaign totals (floored at 0) on completed→refunded/failed | Unknown | 5 |
| 40 | `payout-info.sql` | **Secure payout accounts** (`payout_accounts` table, RLS owner+admin) + `payout_requests` snapshot columns; `create_payout_request` sources/snapshots payout info + enforces a configurable minimum; `mark_payout_paid` accepts a payment date | Unknown | payouts.sql, payout-commission.sql |
| 41 | `campaign-expiration.sql` | **Campaign expiration & archive** — adds `expired`/`funded`/`cancelled` statuses; widens `campaigns_select_public` to archived states (URLs+SEO keep working); `expire_due_campaigns()` (cron-driven) flips active+past-deadline → `funded`/`expired`; owner expiry/funding notification | Unknown | 1 |
| 42 | `campaign-extensions.sql` | **Campaign extension workflow** (self-contained) — `campaign_extension_requests` table + `campaigns.extension_count`/`original_deadline`; `request`/`approve`/`reject`/`cancel`/`close` RPCs + `get_campaign_extension_history()`. A request never reactivates a campaign — only admin approval does | Unknown | 41 |
| 43 | `completion-reports-v2.sql` | **Moderated completion reports (Phase 1)** — `campaign_reports` moderation `status` (existing reports grandfathered `approved`) + `fund_breakdown`/`timeline`/media/review columns; only approved reports public; `review_completion_report`, `campaign_total_withdrawn` | Unknown | 8, 14 |
| 44 | `guest-donations.sql` | **Guest donations** — `donations.donor_name`/`donor_email`/`donor_phone` (PII, owner/admin RLS) + `name_display`; rebuilds `campaign_donors` view to render the chosen display name for guests + registered without exposing contact | Unknown | 7 |
| 45 | `financial-ledger.sql` | **Financial ledger, summary & integrity** — immutable append-only `financial_ledger` (one row per money movement; signed amount; UPDATE/DELETE blocked); auto-record triggers on donations/payouts + backfill; `record_ledger_adjustment` (admin+reason→ledger+audit); `financial_summary` view; `public_financial_stats()` (anon, safe); `check_financial_integrity()`; `campaign_financials()` | Unknown | 18, 26, 31 |
| 46 | `financial-snapshots.sql` | **Snapshots, ledger extension & reconciliation** — extends `financial_ledger` (`user_id`/`reference_id`; `campaign_credit`/granular withdrawal-lifecycle/`chargeback` types; 0-amount lifecycle events + backfill); `financial_snapshots` + idempotent `generate_financial_snapshot()` (daily cron); `reconciliation_report()`; `public_financial_series()`; `public_financial_stats()` +avg/largest | Unknown | 45 |

Supporting files: `supabase/verify-migrations.sql` (read-only status checker), `supabase/check-notifications.sql`, `supabase/MIGRATIONS.md`, `docs/migration-status.md`.

---

## 8. API Routes

All under `app/api/`, `runtime = 'nodejs'`. All POST/PATCH bodies are Zod-validated.

| Route | Methods | Purpose | Auth | Permissions | Response |
|---|---|---|---|---|---|
| `/api/auth/signup` | POST | Create account (rate-limited), validate/sanitize username | Public | — | `{ ok, needsConfirmation }` / error |
| `/api/auth/login` | POST | Login by email or username (rate-limited) | Public | — | `{ ok }` / 401 generic |
| `/api/auth/username-available` | GET | Live username availability | Public | — | `{ available, reason }` |
| `/api/auth/forgot-password` | POST | Send password-reset email (rate-limited, Turnstile) | Public | — | `{ ok }` (anti-enumeration) |
| `/api/donations` | POST | Record a **pending** donation (rate-limited), hand off to provider | Optional (guests allowed) | Campaign must be `active` | `{ donationId, status, reference, redirectUrl, instructions }` |
| `/api/payments/webhook` | POST | Gateway callback: verify → dedupe → log → confirm → mark | Provider signature | `501` until a real provider is registered | `{ ok }` / `{ duplicate }` / error |
| `/api/payments/status` | GET | Poll donation status by `payment_ref` (non-PII) | Public (holds ref) | — | `{ found, amount, status, campaignTitle, campaignSlug }` |
| `/api/verification/submit` | POST | Submit KYC request + document paths | Required | Self; paths must be in user's folder | `{ ok, requestId }` |
| `/api/admin/verifications` | GET, POST | Signed doc URLs (GET); approve/reject (POST) | Required | **Admin** | `{ documents }` / `{ ok }` |
| `/api/admin/set-role` | POST | Change a user's role | Required | **Admin**; self-change blocked | `{ ok }` |
| `/api/campaigns/create` | POST | Create a campaign (rate-limited, Turnstile) | Required | Self; KYC-gated at RLS (unverified → forced `draft`) | `201 { ok, slug }` / error |
| `/api/campaigns/flag` | POST, PATCH | Submit flag (POST); resolve (PATCH) | Required | POST: any auth; PATCH: **admin** | `{ ok }` / `409 already_reported` |
| `/api/campaigns/reports` | POST, PATCH, DELETE | Manage completion reports | Required | Owner/manager; campaign must be completed | `{ ok, id }` |
| `/api/campaigns/views` | POST | Record view + recently-viewed (rate-limited, owner excluded) | Optional | — | `{ ok, counted }` |
| `/api/push/notify` | POST | Supabase DB-webhook → OneSignal push | Shared secret header | `503` if unset, `401` on mismatch | always `200`-style ack |
| `/api/admin/extensions` | POST | Approve/reject a campaign extension (calls RPC; revalidates home on approve) | Required | **Admin** (RPC re-checks `is_admin()`) | `{ ok }` / error |
| `/api/admin/finance/export` | GET | Download the financial ledger as CSV (UTF-8 BOM; formula-injection-safe) | Required | **Admin** | `text/csv` attachment |
| `/api/contact` | POST | Store a contact-form message (rate-limited, Turnstile) | Public | — | `201 { ok }` / error |
| `/api/cron/expire-campaigns` | GET | Daily sweep: archive due campaigns via `expire_due_campaigns()` | `CRON_SECRET` Bearer (fail-open if unset) | — | `{ ok, expired }` |
| `/api/cron/financial-snapshot` | GET | Daily idempotent financial snapshot via `generate_financial_snapshot()` | `CRON_SECRET` Bearer (fail-open if unset) | — | `{ ok, created }` |

---

## 9. Environment Variables

Names only — never commit real values. Template: `.env.example`.

| Variable | Purpose | Required? | Usage |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) | ✅ Required | Browser + server clients, middleware |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) | ✅ Required | Browser + server clients, middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **secret, server-only**, bypasses RLS | ✅ Required (for donations, admin, webhooks) | `lib/supabase/admin.ts` |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL | ✅ Required | SEO/sitemap, push click URLs |
| `CLICK_MERCHANT_ID` / `CLICK_SERVICE_ID` / `CLICK_SECRET_KEY` | Click gateway — **secret** | ⏳ Optional today (no provider impl) | Reserved for future Click provider |
| `PAYME_MERCHANT_ID` / `PAYME_SECRET_KEY` | Payme gateway — **secret** | ⏳ Optional today | Reserved for future Payme provider |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | OneSignal app id (public) | ⏳ Optional (push off without it) | OneSignal web SDK |
| `ONESIGNAL_REST_API_KEY` | OneSignal REST key — **secret** | ⏳ Optional | `/api/push/notify` |
| `SUPABASE_WEBHOOK_SECRET` | Shared secret for push webhook — **secret** | ⏳ Optional (push webhook returns 503 without it) | `/api/push/notify` auth |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting — **secret** | ⏳ Optional (fails open if absent) | `lib/rate-limit.ts` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget (public) | ⏳ Optional (widget hidden if absent) | `components/security/Turnstile.tsx` |
| `TURNSTILE_SECRET_KEY` | Turnstile server verification — **secret** | ⏳ Optional (verification skipped/fail-open if absent) | `lib/security/turnstile.ts` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (public by design) | ⏳ Optional (SDK inert if absent) | `sentry.*.config.ts` |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Sentry source-map upload — **secret**, build-time only | ⏳ Optional (upload skipped if absent) | `next.config.mjs` (`withSentryConfig`) |

> Secrets must never use the `NEXT_PUBLIC_` prefix. Set them in Vercel project env (server scope).

---

## 10. Deployment

**GitHub** — Repository on `main`. CI: `.github/workflows/ci.yml` runs on push/PR to `main` →
`npm install` → `npm run typecheck` → `npm run build` (with placeholder Supabase env).
No lint step (no ESLint config). **No `package-lock.json` committed** (so `npm ci`/cache disabled).

**Vercel** — Framework auto-detected (`vercel.json`). Set all required env vars (§9) at server scope.
Image remote patterns restricted in `next.config.mjs` to the Supabase project host + `images.unsplash.com`.

**Supabase** — Run migrations in order (§7) via SQL Editor; verify with `verify-migrations.sql`.
Configure: Google OAuth provider (for #27), OneSignal + DB webhook on `notifications` insert (for #29).
Confirm storage buckets exist (`campaign-images`, `profile-photos`, `campaign-reports`, `verification-documents`).

**Custom domain** — `xayr.uz` (referenced in CI build env + SEO). Point DNS at Vercel; set `NEXT_PUBLIC_APP_URL=https://xayr.uz`.

**Environment setup** — Copy `.env.example` → `.env.local`, fill values; mirror into Vercel.

**Production deployment steps**
1. Merge to `main` → CI runs typecheck + build.
2. Vercel auto-deploys on green.
3. Apply any new migrations in Supabase **before** the deploy depends on them; re-run the verifier.

**Rollback**
- App: redeploy a previous Vercel deployment (instant) or revert the commit and let CI/Vercel rebuild.
- DB: migrations are forward-only and idempotent — no automatic down-migrations. Roll back schema changes by writing a compensating migration. Plan DB changes to be backward-compatible with the previous app version.

---

## 11. Payment System Status

**Architecture.** Provider-agnostic abstraction in `lib/payments/`:
- `types.ts` — `PaymentProvider` contract (`createPayment`, optional `verifyWebhook`), `PaymentIntent`, `WebhookResult`.
- `index.ts` — provider registry + `getPaymentProvider()`.
- `providers/manual.ts` — the only registered provider (records pending, no charge).
- `confirm.ts` — `confirmDonation()` (service-role, idempotent; amount **and** currency are **mandatory** and fail closed; a definitive mismatch marks the donation `failed` + alerts admins, never left pending).
- **Money-loss hardening (2026-06-24, see `docs/payment-security-audit.md`):** M1 webhook signature enforcement (reject on `signatureValid===false`), M2 mandatory amount/currency, M3 refund reversal (`supabase/payment-refund-reversal.sql` — reverses campaign totals + payout availability on refund/fail), M5 mismatch→failed+admin alert. **M4 (migration #5 live in prod) remains UNVERIFIED — run `verify-migrations.sql` before enabling payments.**
- `helpers.ts` — `createPaymentEvent`, `isDuplicateWebhook`, `markPaymentProcessed`, `validatePaymentAmount`, `validateCurrency`.

**Current flow.** `DonationForm` → `POST /api/donations` → service-role insert as `pending` → `manual` provider returns a `manual_<id>` reference + "coming soon" instructions → `payment_ref` saved. `apply_donation` credits the campaign **only** when a donation reaches `completed`.

**Current limitations.**
- No real gateway: nothing transitions a donation to `completed` automatically.
- The manual admin-completion tool was **removed** (migration #31 notes), so there is currently **no in-app path** to complete a donation — only a direct service-role DB write.
- `DonationForm` does not present payment-method selection.

**Ready for providers?** **Yes.** The webhook route (`/api/payments/webhook`) already verifies signatures (delegated), dedupes by `provider_event_id`, logs to `payment_events`, confirms with server-side amount/currency checks, and marks processed/retryable. Registering a provider in `index.ts` activates the full path with no other changes.

**Missing work.** Implement `createPayment` + `verifyWebhook` for Click or Payme; register it; add method selection to the donation UI; sandbox-test; add refund handling.

**Merchant requirements.** A registered Uzbek merchant account with Click and/or Payme; merchant/service IDs + secret keys (env vars already scaffolded); a public webhook URL allow-listed with the provider.

---

## 12. Security

- **RLS** — Enabled on every base table; policies scope reads/writes to owner/admin/public as appropriate. Donations insert restricted to `pending` (migration #5). Protected campaign columns guarded by trigger. *Live application unverified — run the verifier.*
- **Authentication** — Supabase Auth (email/password + Google OAuth, PKCE); email-confirmation publish gate; middleware refreshes sessions and **fails open** so auth issues never 500 the whole site (every protected surface re-checks server-side).
- **Authorization** — Admin routes re-verify `role='admin'` server-side via `auth.getUser()` before any service-role write. Role changes only through `/api/admin/set-role` (self-change blocked). Users cannot self-promote (column grants exclude `role`/`verification_status`).
- **Storage** — Own-folder policies on public buckets; `verification-documents` private with 5-minute admin signed URLs; KYC submit validates paths are in the user's folder.
- **Rate limiting** — Upstash sliding-window via the shared `enforceRateLimit` / `rateLimitOr429` helpers (`lib/rate-limit.ts`); fails open if Redis is unavailable. Buckets: login, signup, reset (password reset), donation, campaign (creation), contact, search, notifications, admin, views. Search + notifications are limited at the middleware layer (prefetch-excluded; search only when a `q` query is present) since they have no API route; admin routes/pages are limited in middleware.
- **Bot protection (Turnstile)** — Cloudflare Turnstile on register, login, password reset, contact, campaign creation, and KYC submission. Always verified server-side (`lib/security/turnstile.ts`); the client token is never trusted. Fails open only when unconfigured (dev). Setup: `docs/turnstile-setup.md`.
- **Validation** — Zod on all API inputs; username sanitization/format enforcement; UUID checks.
- **Webhook & redirect hardening** — The push webhook's shared secret is compared in **constant time** (`crypto.timingSafeEqual`, `lib/security/timing-safe.ts`), closing a timing side-channel. Post-auth redirect targets (`next`) pass through a single `safeNextPath()` guard (`lib/security/redirect.ts`) that rejects external / protocol-relative / backslash-smuggled / control-char paths and falls back to `/` — used by the auth callback **and** the login form. The payment webhook already fails closed on `signatureValid === false` and dedupes replays by `provider_event_id`.
- **Security headers** — Set in `next.config.mjs` for all routes: `Content-Security-Policy` (scoped to Supabase REST+realtime, OneSignal SDK/API, Turnstile; `'unsafe-inline'` for Next's inline scripts/styles, `img-src https:`), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/payment/topics off), `Strict-Transport-Security` (2y, includeSubDomains, preload). `upgrade-insecure-requests` is production-only.
- **Error monitoring** — Sentry (`@sentry/nextjs`) tracks frontend, API/server, and middleware errors via `instrumentation.ts` (`onRequestError`), `sentry.{client,server,edge}.config.ts`, and `app/global-error.tsx`. Inert without a DSN. DSN is public; the source-map auth token is a build-time secret. Setup: `docs/sentry-setup.md`.
- **Secrets** — Service role, OneSignal REST key, webhook secret kept server-only (never `NEXT_PUBLIC_`).
- **XSS** — User content rendered as text; `dangerouslySetInnerHTML` used only for `JSON.stringify`'d JSON-LD (5 controlled sites).

**Known risks**
| Sev | Item |
|---|---|
| 🔴 | Broad `SELECT` on `public.users` exposes `email`/`phone`/`rejection_reason` to anyone with the anon key (PII enumeration). See `docs/rls-audit.md` F1 — needs a coordinated schema+app fix (public-safe view / PII split), not a blind change. |
| ⚠️ | Live RLS unverified — biggest real risk if migration #5 (and others) aren't applied in prod. |
| 🟡 | `campaign_shares` / `campaign_flags` allow anonymous/auth insert → analytics/spam inflation. |

---

## 13. Localization

- **Languages:** Uzbek (default), Russian, English. Config in `i18n/config.ts`; routing via `/[locale]/…` + `NEXT_LOCALE` cookie + middleware redirect.
- **Coverage:** `locales/{uz,ru,en}/common.json` — all three are **1305 lines** (parity maintained). Server dictionaries loaded lazily (`i18n/dictionaries.ts`).
- **Missing translations:** No structural gaps detected (equal line counts). Some Uzbek UI strings are hardcoded in components/API error messages (e.g. toast text in `DonationForm`, API error strings) rather than dictionary-driven.
- **Remaining work:** Extract hardcoded UI/toast/API strings into the dictionaries for full coverage; add a CI check that locale files stay key-aligned.

---

## 14. Mobile Experience

- **Implemented:** Bottom navigation (`components/layout/BottomNav.tsx`), 48px min touch targets (donation presets/buttons), responsive grids throughout, sticky donate action on campaign detail, PWA manifest (`app/manifest.ts`), apple-icon.
- **Responsive layout:** Tailwind breakpoints (`sm`/`md`/`lg`) used consistently across home, listing, detail, admin.
- **Bottom navigation:** Present for primary navigation on small screens.
- **Sticky actions:** Donate flow surfaces a persistent CTA.
- **Remaining improvements:** Native app wrapper (optional), offline support beyond manifest, mobile-specific image size tuning audit.

---

## 15. SEO

- **Implementation:** `lib/seo.ts` (`pageMetadata`, `buildAlternates`), `lib/campaign-jsonld.ts`.
- **Metadata:** Dynamic per-page `title`/`description` (localized).
- **Open Graph / Twitter:** `summary_large_image`; dynamic per-campaign OG image (1200×630 with photo + progress + brand, gradient fallback); default branded OG card.
- **Structured data (JSON-LD):** Organization + WebSite (with SearchAction) site-wide; per-campaign `@graph` (BreadcrumbList, WebPage, DonateAction); Person on creator profiles; FAQPage on `/faq`.
- **Sitemap:** `app/sitemap.ts` — dynamic, active campaigns, `lastModified` from `updated_at`, image entries, hreflang alternates, hourly revalidate, capped at 5000 campaigns.
- **Robots:** `app/robots.ts` — allows public; disallows `/api`, `/admin`, `/profile`, `/auth`, `/notifications`; points to sitemap.
- **Canonical / hreflang:** Canonical + `uz`/`ru`/`en` + `x-default` on every page.
- **Remaining improvements:** Per-campaign OG alt text (currently generic); `Article` structured data on campaign updates; submit sitemap to Google Search Console; sitemap-index when catalog grows.

---

## 16. Performance

- **Caching:** Home uses ISR (`revalidate=60`); sitemap revalidates hourly; listing is `force-dynamic` (filter/pagination dependent).
- **Optimization:** Single paginated, indexed listing query (only one page transferred); platform stats fetched in parallel; trigram + composite indexes (`optimize-campaign-indexes.sql`).
- **Image loading:** Next/Image with `sizes`, `quality`, remote-host allowlist; gradient fallbacks.
- **Code splitting:** RSC by default; client components scoped; dictionaries dynamically imported per locale.
- **Known bottlenecks:** Search runs a secondary creator-lookup query then an OR filter (acceptable now; revisit at scale). No CDN-level caching strategy documented beyond Vercel defaults. No DB connection pooling notes (Supabase-managed).

---

## 17. Known Issues

| Sev | Description | Location | Suggested fix |
|---|---|---|---|
| 🔴 Critical | No real payment gateway — donations never auto-complete; no in-app completion path (manual tool removed) | `lib/payments/providers/`, `app/api/donations/route.ts` | Implement & register a Click/Payme provider. |
| 🔴 Critical | Live RLS unverified — base `schema.sql` allows `donations_insert_any`; only migration #5 restricts to pending. If #5 isn't applied, totals are forgeable | `supabase/secure-donations-rls.sql` | Run `verify-migrations.sql`; apply #5 (and all) in prod. |
| 🟠 High | No `package-lock.json` → non-reproducible builds; CI can't use `npm ci` | repo root, `.github/workflows/ci.yml` | Commit a lockfile; switch CI to `npm ci`. |
| 🟠 High | No automated tests; CI = typecheck + build only | repo-wide | Add tests for payment idempotency, RLS, donation trigger. |
| 🟡 Medium | No transactional email (receipts, payout confirmations, contact replies) | — | Integrate an email provider. |
| 🔴 Critical | Broad `SELECT` on `public.users` leaks `email`/`phone`/`rejection_reason` (PII enumeration via anon key) | `supabase/schema.sql` `users_select_all` | Public-safe profile view or split PII into own-row-RLS table; see `docs/rls-audit.md` F1. |
| 🟡 Low | `campaign_shares` / `campaign_flags` insert inflation | flag/share insert paths | Rate-limit or server-throttle. |
| 🟡 Low | Hardcoded Uzbek strings in some components/API errors bypass i18n | `components/donations/DonationForm.tsx`, various API routes | Move into dictionaries. |
| ✅ Fixed | ~~Push webhook secret compare not constant-time~~ → `crypto.timingSafeEqual` (`lib/security/timing-safe.ts`) | `app/api/push/notify/route.ts` | Done. |
| ✅ Fixed | ~~Auth callback `next` not restricted to relative paths~~ → centralized `safeNextPath()` guard | `lib/security/redirect.ts`, `app/auth/callback/route.ts`, `components/auth/LoginForm.tsx` | Done. |

---

## 18. Technical Debt

- **Dual schema source of truth:** `supabase/schema.sql` and `supabase/000_master_migration.sql` both exist — drift risk. Document which is canonical.
- **Unused scaffolding:** `admin_audit_log` table retained but no writer remains (manual donation tool removed). Either use it for admin-action logging or drop it.
- **Provider registry comment vs reality:** `lib/payments/index.ts` references Click/Payme that don't exist yet (clearly marked as future, but reads as more-than-present).
- **No ESLint config:** `next lint` intentionally skipped; lint-class issues uncaught.
- **Hardcoded copy:** Toast/error strings not fully i18n-driven (see §13/§17).
- **`as unknown as Campaign[]` casts** in listing/home queries — acceptable but loosens type safety at the data boundary.
- **No down-migrations / migration tooling:** all manual + forward-only.

---

## 19. Launch Checklist

### Critical (block launch with real money)
- [ ] Implement & register a live payment provider (Click or Payme).
- [ ] Add payment-method selection to the donation UI.
- [ ] Run **all** migrations in production; confirm with `verify-migrations.sql` (esp. #5 donations RLS).
- [ ] Commit `package-lock.json`; switch CI to `npm ci`.
- [ ] Set all required env vars in Vercel (server scope), no secrets as `NEXT_PUBLIC_`.
- [ ] Verify storage buckets + RLS exist (incl. private `verification-documents`).
- [ ] Smoke-test full flow: signup → KYC → create → donate → complete (webhook) → payout.

### Recommended
- [ ] Add automated tests (payment idempotency, RLS, donation→credit).
- [ ] Transactional email (receipts, payout confirmations, contact replies).
- [ ] Configure OneSignal + Supabase notification webhook (live push).
- [x] Constant-time webhook secret compare; restrict auth-callback `next` (`lib/security/{timing-safe,redirect}.ts`).
- [x] Error monitoring (Sentry) — `docs/sentry-setup.md`.
- [ ] Submit sitemap to Google Search Console.

### Optional
- [ ] Rate-limit share/flag inserts.
- [ ] Platform analytics (Plausible/PostHog).
- [ ] Full-text search upgrade.
- [ ] Real admin-curated featured campaigns.
- [ ] Refund flow.

---

## 20. Investor Readiness

| Dimension | Assessment |
|---|---|
| **Technical readiness** | **High.** Clean, typed, documented Next.js 15 + Supabase architecture; strong SEO/i18n/mobile; thoughtful security design and internal audit docs. |
| **Business readiness** | **Medium.** Complete creator→donor→reporting→payout product loop is built; cannot yet transact real money. Demonstrable as a working product minus live charging. |
| **Payment readiness** | **Low.** Abstraction is production-grade and provider-ready, but no live gateway — the single biggest gap. ~5–10 working days to money-ready MVP. |
| **Security** | **Medium-High.** Strong model (tamper-proof donations, column grants, guarded fields, service-role confinement). Gated on verifying RLS is actually applied in production. |
| **Scalability** | **Medium-High.** Indexed, paginated queries; serverless on Vercel + managed Postgres. Manual migrations and absence of tests are the main scaling-process risks. |

**Bottom line:** A polished, near-complete platform whose only critical blocker to launch is live payment integration plus verifying production RLS.

---

## 21. Next Recommended Tasks

Prioritized; effort sized **Small** (<1d), **Medium** (1–3d), **Large** (3d+).

| # | Task | Impact | Effort |
|---|---|---|---|
| 1 | Implement & register a Click or Payme provider (unblocks all money flow) | 🔴 Highest | Large |
| 2 | Run + verify all migrations in production (`verify-migrations.sql`) | 🔴 Highest | Small |
| 3 | Commit `package-lock.json`; switch CI to `npm ci` | 🟠 High | Small |
| 4 | Add payment-method selection to `DonationForm` | 🟠 High | Small |
| 5 | Transactional email (receipts, payout confirmations, contact replies) | 🟠 High | Medium |
| 6 | Automated tests: payment idempotency, RLS, donation→credit trigger | 🟠 High | Medium |
| 7 | Configure OneSignal + Supabase webhook (activate live push) | 🟡 Medium | Small |
| 8 | ~~Error monitoring (Sentry)~~ ✅ done (`docs/sentry-setup.md`) + structured logging | 🟡 Medium | Small |
| 9 | Security hardening: ~~constant-time webhook compare, restrict callback `next`~~ ✅ done; rate-limit share/flag inserts remains | 🟡 Medium | Small |
| 10 | Refund flow (status handling + admin UI) once a gateway exists | 🟡 Medium | Medium |

---

## Maintenance Rules

This document must stay synchronized with the codebase. **Whenever a feature is
added, removed, or changed:**

1. Update the affected section(s) here.
2. Update completion percentages (§2).
3. Update the roadmap (§5, §21).
4. Update known issues (§17) and technical debt (§18).
5. Update migrations (§7) and the live-status column when migrations are applied.
6. Update deployment instructions (§10) if the process changes.
7. Update the "Last synced" date and commit reference at the top.

**Workflow:** Before implementing any feature, read `PROJECT_STATUS.md` first, then
audit the relevant part of the codebase before making changes. Never let this file
go stale.
