# Xayr — SEO Audit

Status of search-engine optimization across the platform, and the changes made
in the "improve seo and security" pass.

## Summary
SEO is **technically strong**. The platform already had dynamic metadata,
canonical + hreflang, dynamic OG images, a dynamic sitemap, and robots rules.
This pass added **per-campaign structured data** and **image sitemap entries**.

## What was already in place (verified)
| Area | Implementation |
|---|---|
| Canonical + hreflang | `lib/seo.ts` → `buildAlternates()` emits canonical + `uz/ru/en` + `x-default` on every page |
| Page metadata | `pageMetadata()` → dynamic `title`/`description`, OpenGraph, `summary_large_image` Twitter card |
| Campaign OG image | `app/[locale]/campaigns/[slug]/opengraph-image.tsx` — dynamic 1200×630 with campaign photo + progress + brand (HEAD-checked fallback to gradient) |
| Default OG image | `app/opengraph-image.tsx` — branded card for non-campaign routes |
| Site structured data | `app/[locale]/layout.tsx` — `Organization` + `WebSite` (with `SearchAction`) JSON-LD |
| Sitemap | `app/sitemap.ts` — dynamic, includes active campaigns, `lastModified` from `updated_at`, hreflang alternates, hourly revalidate |
| Robots | `app/robots.ts` — allows public, disallows `/api`, `/admin`, `/profile`, `/auth`, `/notifications`; points to sitemap |

## Changes made in this pass
1. **Per-campaign JSON-LD** — `lib/campaign-jsonld.ts`, rendered in the campaign
   page. A `@graph` with:
   - **BreadcrumbList** (Home › Campaigns › Title) → breadcrumb rich result.
   - **WebPage** with `inLanguage`, `primaryImageOfPage`, `isPartOf` WebSite.
   - **DonateAction** (`potentialAction`) marking the page as a fundraiser, with
     `recipient` = the creator (Person) or Xayr (Organization).
2. **Image sitemap entries** — `app/sitemap.ts` now attaches each campaign's
   `image_url` as an `images: [...]` entry, helping cover images get indexed.

## Sitemap validation
- One entry per locale per path; **absolute URLs** (via `localeUrl`).
- `lastModified` is a real `Date` (campaign `updated_at`), `changeFrequency` and
  `priority` are valid enum/numbers.
- hreflang alternates present on every entry incl. `x-default`.
- Active campaigns only (drafts/rejected excluded) → no thin/private pages.
- Capped at 5000 campaigns (single sitemap limit is 50k URLs × locales; raise to
  a sitemap index if the catalog ever approaches that).

## "Why Xayr may not rank yet" — diagnosis
Not a technical-SEO gap. Likely causes:
1. **New domain** with little authority/backlinks — needs time + inbound links.
2. **Content volume** — few indexed campaigns yet; ranking grows with catalog.
3. **Migrations not applied** — if campaign features/data aren't live (see
   `docs/migration-status.md`), some pages may 404/redirect and not get indexed.
4. **Indexing latency** — submit the sitemap in Google Search Console and request
   indexing; allow days–weeks.

## Recommended next (not done here)
- Submit `https://xayr.uz/sitemap.xml` to **Google Search Console**; verify coverage.
- Add `FAQPage` JSON-LD to `/faq` for FAQ rich results.
- Consider `Article`/`NewsArticle` structured data on campaign updates.
- Add OG/Twitter image alt text per campaign (currently generic alt).
