# IndustryForms — Project State (handoff)

Last updated: 2026-07-04. Catch-up doc for a fresh session. Read this first.

## What it is
**IndustryForms** — a SaaS job-management app for NZ/AU tradespeople (a Tradify
competitor). Monorepo at `D:\TRADIEE`:
- `tradiee-app/` — **Next.js 16** web app (App Router, Turbopack)
- `tradiee-mobile/` — **Expo SDK 56** mobile app (bare workflow, native `android/` dir)
- `supabase/migrations/` — database migrations (001–046)
- Root docs: this file, `POWERSYNC_SETUP.md`, `R2_SETUP.md`, `SUPABASE_CLOUD_MIGRATION.md`, `VERCEL_DEPLOY.md`, `sync-rules.yaml`

GitHub: **https://github.com/NZGrimstock/industryforms** (branch `main`, auto-deploys to Vercel).

### Where work lives right now
**`main` is current** — Growth Engine Sprint A (Unified Inbox) and Sprint B
(Bookings Website add-on) merged 2026-07-03/04, executing
`SPRINTS_GROWTH_ENGINE_RESCOPED.md` (see that file + `SPRINT_A_INBOX_EXECUTION.md`
for the full sprint plan; Sprint C/D/E not started — availability engine,
booking widget + deposits, automations + reporting). Latest APK is
`tradiee-mobile/android/app/build/outputs/apk/release/app-release.apk`
(Jun 25, 145 MB — mobile untouched by the Growth Engine sprints). Migrations
now use timestamped filenames (`YYYYMMDDHHMMSS_description.sql`), not the old
`0XX_` numbering — latest is `20260703114752_bookings_website_addon.sql`, all
applied to cloud Supabase. PowerSync sync rules switched to **streams
(edition 3)** — already validated + deployed via the PowerSync Dashboard.

**Correction to a long-standing assumption**: Twilio and Stripe are **both
already live** (real credentials in `.env.local`/Vercel), not dark/pending as
older docs (including early Growth Engine planning) assumed. Signature
verification on `/api/sms/inbound` was missing until Sprint A — a real gap
against live traffic, not just go-live prep.

## Live infrastructure (all provisioned)
| Piece | Detail |
|---|---|
| **Supabase** | Cloud project ref `cfltbpwrojtlpkjvresd` (Sydney/SEA). **New API keys**: publishable (client) + secret (server) — NOT legacy anon/service_role. Migrations 001–046 all applied to cloud. |
| **Web hosting** | **Vercel**, custom domain **app.industryforms.app**. Vercel **Root Directory = `tradiee-app`**, **Framework Preset = Next.js**. `tradiee-app/vercel.json` defines two daily crons (`/api/reminders` 20:00 UTC, `/api/daily-todos` 18:00 UTC = 6am NZ). |
| **Storage** | **Cloudflare R2** (S3-compatible). Buckets: `industry-forms-public` (logos, job photos, customer sign-offs — via **cdn.industryforms.app**) and `industry-forms` (private compliance PDFs via presigned URLs). |
| **Offline sync** | **PowerSync** `https://6a33b406deeddd0df605d498.powersync.journeyapps.com`, connected to cloud DB, JWKS auth via Supabase. `sync-rules.yaml` is now **edition-3 sync streams** (deployed). |
| **SMS** | **Twilio** — credentials live (configured by user 2026-06-22). Inbound webhook → `/api/sms/inbound`. |
| **Mobile** | Expo `@grimstock/industryforms` (EAS, logged in as `grimstock`). APK builds via **local Gradle**: `cd tradiee-mobile/android && gradlew.bat assembleRelease --no-daemon`. EAS free plan resets **2026-07-01** — use EAS for future cloud builds then, or use local Gradle on Windows. Don't run release builds back-to-back — flaky `packageRelease` lock errors; if it fails run `gradlew.bat clean assembleRelease`. |

## Env vars (NEVER commit real secret values)
**Set in Vercel → Project Settings → Environment Variables** (Production +
Preview), then redeploy. Mirror non-secret ones in `tradiee-app/.env.local`
for local dev. Settings → Integrations now shows a green-tick / amber-warning
on each of these so the owner sees what's missing without peeking at env vars.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `R2_ACCOUNT_ID`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_*`/`R2_PRIVATE_*` keys, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://cdn.industryforms.app`
- `NEXT_PUBLIC_APP_URL=https://app.industryforms.app`, `NEXT_PUBLIC_POWERSYNC_URL`, `CRON_SECRET`
- **LocationIQ** — `NEXT_PUBLIC_LOCATIONIQ_KEY` for geocoding (address autocomplete + job map pins). Falls back to Nominatim (rate-limited in prod) if unset.
- **Twilio (live)** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Point the number's "A MESSAGE COMES IN" webhook at `https://app.industryforms.app/api/sms/inbound` (POST).
- **Resend (pending)** — `RESEND_API_KEY`, `EMAIL_FROM` (verified sender domain).
- **Stripe (pending)** — `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Webhook target: `/api/stripe/webhook`. Needed for online invoice payments, plan upgrades, and Tap to Pay.
- **Anthropic (live)** — `ANTHROPIC_API_KEY` for SmartWrite / AI quote drafting / daily AI to-dos.
- **Other placeholders** — `XERO_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` (real value present), `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID` (+optional `CLOUDFLARE_SAAS_FALLBACK_HOSTNAME`), `INBOUND_EMAIL_SECRET`.

Mobile `tradiee-mobile/.env` + `eas.json` carry `EXPO_PUBLIC_*` equivalents (client-public, baked into builds).

## Features built

### Core workflow
**Enquiries** (+convert, dup-detection; sources incl. website, email inbox,
booking widget; **AI-draft-quote** from the convert dialog grounds line items
in the price list) → **Quotes** (builder with sections, price-list, kits,
optional sections + online accept/decline, per-line + document **discounts**,
per-line **tax**, **gross-profit** display, **save-as-template** /
new-from-template, public `/q/[token]`, email/SMS) → **Jobs** (list/board/map,
detail, **custom statuses**, assign to team member, **per-job tasks**,
recurring) → **Scheduling** (visits, Google Calendar sync) → **Invoicing**
(full/progress/actuals, line items + discounts + per-line tax + tax-inclusive
mode, payments incl. **Stripe**, **Xero** sync, recurring invoices, bulk
invoicing, email/SMS, public `/i/[token]`) → **Payments** → **Review request
email** auto-sent after paid.

### Growth Engine Sprint A + B (2026-07-03/04) — unified inbox + bookings website add-on

Executing `SPRINTS_GROWTH_ENGINE_RESCOPED.md`. Full detail in commit messages
(`git log`); summary below. **Reality check that changed scope**: Twilio and
Stripe are both already live — this wasn't prep-for-future-go-live, it closed
active gaps against real traffic.

**Sprint A — `/messages` unified inbox**
New owner/admin page merging `customer_messages` (SMS, grouped by customer)
and `enquiries` (web leads) into one feed with tabs (Open/Unread/Bookings/
Enquiries/Unmatched/Closed), normalized in `lib/messages.ts` and shared
between the SSR page and a 15s-polled `/api/messages/conversations`. Triage
actions in `/api/messages/action` (mark read/closed/spam, create-customer-
from-unmatched with thread re-homing). `components/customers/sms-thread.tsx`
(pre-existing, already used on `/customers/[id]`) extended with a
`twilioLive` prop for a dark-aware disabled reply box.
Real fixes along the way: `/api/sms/inbound` had **no signature
verification** despite live Twilio credentials (added HMAC-SHA1 check in
`lib/sms.ts`, no new dependency — 503 dark/unset, 403 invalid signature); it
was also **silently dropping unmatched inbound** (comment claimed otherwise,
code didn't) — now persists with `customer_id null` so it surfaces in the
Unmatched tab. Added `TWILIO_OWNER_COMPANY_ID` env var for unmatched-sender
company resolution (**add this to Vercel** — local-only in `.env.local` right
now, no per-company Twilio number mapping exists yet). Also fixed
`enquiry_source` enum missing `'booking'` — `/api/site/lead` had been
inserting an invalid value for every booking-kind lead since the
`BookingForm` component was added (found while normalizing enquiry sources
for the inbox feed).

**Sprint B — Bookings Website add-on ($19/mo)**
Found two parallel gating mechanisms for what should've been one add-on:
`companies.addons.website` (JSONB, unused for gating) and
`company_websites.subscription_active` (the real one, driven by a live
Stripe webhook). Consolidated onto `hasAddon('bookings_website')` for both
site-publish and custom-domain gates; migration backfills existing
subscribers so nobody loses access. Added a **bookings on/off toggle**
(independent of publishing) and exposed the `'booking'` website-section type
in the builder — it existed in the type system and render path but had no
UI to add one. Added **custom static-site hosting**: single-HTML-file
upload (zip support deliberately deferred — needs its own zip-slip/zip-bomb
security pass), served via `proxy.ts`'s native external-URL middleware
rewrite (true edge reverse-proxy, visitor's address bar stays on their
domain). Verified cookie isolation before shipping (no wildcard cookie
domain anywhere — Supabase auth cookies are host-only scoped to
`app.industryforms.app`), added CSP on served custom content, and — since it
was missing entirely — added global `X-Frame-Options`/`frame-ancestors` on
the main app in `next.config.ts` (any page including `/login` could
previously be framed by any third-party site). Super-admin takedown control
lives on a new `/admin/companies/[id]` detail page — the companies list had
been linking to that route already, 404ing, since no detail page existed.

**Not started**: Sprint C (bookable packages + concurrency-safe availability
engine — the hardest sprint, needs a slot-hold design before any slot code),
Sprint D (public booking widget + Stripe deposits), Sprint E (automations +
reporting).

### Sprint 6 (2026-07-03) — mobile nav/quote fixes + kits + signup, all on `main`

**Mobile: fixed quote creation crash**
`tradiee-mobile/app/quotes/new.tsx` inserted quotes without `quote_number`,
violating the not-null constraint. Now generates the number the same way the
web app does (`companies.quote_prefix` + running count). Also added an
**expiry-days picker** (7/14/30/60, was hardcoded to 30 with no UI) and a
**job site selector** (populated from the chosen customer's `customer_sites`,
writes `quotes.site_id`) — both were previously missing from the mobile form.

**Mobile: mandatory customer fields on quick-add**
The inline "new customer" mini-forms in `tradiee-mobile/app/jobs/new.tsx` and
`tradiee-mobile/app/quotes/new.tsx` now require name, email, phone, and
billing address (jobs' quick-add previously only collected name+phone). A
`customer_sites` row is auto-created from the billing address, same as the
web customer form.

**Web: mandatory customer fields**
`tradiee-app/components/forms/customer-form.tsx` — email, phone, and billing
address are now required (previously only name was required).

**Mobile: navigation fix for More-tab screens**
Customers, Invoices, Time Logs, Job Map, and Invitations were registered as
*hidden tabs* inside the `(tabs)` navigator (`href: null`), so opening them
from the More menu did a tab-switch rather than a stack push — Android back
button jumped to Home instead of returning to More. Moved all five out of
`(tabs)/` into top-level stack routes (`app/customers/index.tsx`,
`app/invoices/index.tsx`, `app/timesheets.tsx`, `app/job-map.tsx`,
`app/invitations.tsx`), registered with native headers in root
`app/_layout.tsx`. Back button now works correctly. Also fixed
`invitations.tsx`'s hardcoded `paddingTop: 56` (no `SafeAreaView`) — now uses
`SafeAreaView` like every other screen.

**Mobile: increased top padding**
Bumped `paddingTop` from 8→20 on the header row of `jobs.tsx`, `quotes.tsx`,
`schedule.tsx`, and added explicit top padding to `home.tsx` and `more.tsx`
(both lacked any — content sat flush against the safe-area edge since the
header bars were removed in a prior sprint).

**Web: kits in job materials & invoice line items**
Kits (bundles of price-list items) were quote-only. Added the same "From
kit" picker to `tradiee-app/app/(dashboard)/jobs/[id]/materials.tsx` (job
materials) and the invoice "Add line item" dialog in
`tradiee-app/app/(dashboard)/invoices/[id]/client.tsx`, alongside a
price-list search that pre-fills the manual line form.

**Web: signup — new trade options + profession tracking**
Added "Automotive" and "Engineer" to the trade/industry dropdown in
`tradiee-app/app/signup/page.tsx` (also now validated as required client-side,
previously bypassable). `trade_type` is logged server-side on signup
(`app/api/auth/signup/route.ts`) and now shown as a "Trade" column on
`/admin/companies`.

### Sprint 5 (2026-06-25) — mobile completeness + web parity, all on `main`

**Mobile: New job — inline new customer**
`tradiee-mobile/app/jobs/new.tsx`: "New customer" button in the customer picker
FlatList header. Switches to an inline form (name, phone); taps "Create &
select" → `POST /api/customers` → auto-selects. "← Back" returns to customer
list. Job creation now goes through `/api/jobs` (was a direct Supabase insert)
so `nextDocNumber()` runs server-side — fixes null `job_number` on mobile.

**Mobile: Photo prompt before sign-off/invoice**
`tradiee-mobile/app/jobs/[id].tsx`: `promptCompleteWithSignoff()` and
`promptCompleteAndInvoice()` check if the job has any photos. If none, fires an
Alert: "Add photos" (opens camera), "Skip & continue", "Cancel". Existing
"Complete & get sign-off" and "Complete & Invoice" buttons now call these wrappers.

**Mobile: "Customer Signature" label in sign-off modal**
Same file: label rendered above the WebView signature pad — uppercase, letter-spaced,
styled to match the section headers.

**Mobile: Auto-track trading hours schedule**
`tradiee-mobile/app/(tabs)/timesheets.tsx`: configurable start/end hour + active
days. Persisted in `AsyncStorage` under key `TRADIEE_TRADING_HOURS`. `useFocusEffect`
reads the schedule and auto-starts/stops GPS tracking when the app comes to
foreground. Gear icon on the auto-track row (orange when enabled); opens settings
modal. Row label changes to "Auto-track (scheduled)" when active.

**Web: Job site picker in new-job dialog**
`tradiee-app/app/(dashboard)/jobs/client.tsx`: when a customer is selected, loads
their `customer_sites` and shows a dropdown. "Add site" button reveals an inline
form (label + address). For new-customer mode, "Add as job site" checkbox +
address field creates a site immediately after the customer is created, then links
`jobs.site_id`. Job insert now carries `site_id`.

**Web: Project subcontractors — company field + required phone/email**
`tradiee-app/app/(dashboard)/projects/[id]/client.tsx`: added "Company *"
required field to the subcontractor form. Phone and email are now required.
Subcontractor list shows `Name · Company (Trade)`. Migration **044** adds
`project_subcontractors.company text`.

**Web: Geocoding → LocationIQ**
`tradiee-app/lib/geocode.ts`: prefers `NEXT_PUBLIC_LOCATIONIQ_KEY`
(`us1.locationiq.com/v1/search`, `countrycodes=nz,au`) over Nominatim. Nominatim
remains as a fallback with `User-Agent: TradeHub/1.0`.

**Web: Configurable default project stages**
`tradiee-app/app/(dashboard)/settings/client.tsx`: "Default project stages" card
in the Workflow tab. Enable toggle, editable stage list, add input, save. Saves to
`companies.default_project_stages` (null = system defaults, `[]` = none, non-empty
= use these). `projects/client.tsx` reads the company setting on new-project
creation. Migration **045** adds `companies.default_project_stages text[]`.

**Web: Logbook trip verification**
`tradiee-app/app/(dashboard)/logbook/client.tsx`: "Verify" button (Circle icon,
orange) on auto-detected trips; clicking sets `travel_logs.verified_at = now()` and
`verified_by = user.id`. Turns to a green "Verified" badge (CheckCircle2). Migration
**046** adds `travel_logs.verified_at timestamptz` + `verified_by uuid`.

### Sprint 3 / Sprint 4 (2026-06-22) — competitor-parity + UX polish, all on `main`

**Quick-action menus** — Tradify-style per-row `⋯` on Customers (→ New quote,
New job pre-filled) and Suppliers (→ New PO, New bill pre-filled). New
reusable `components/ui/row-actions.tsx`. `?customerId` / `?supplierId` are
plumbed through the relevant `/new` pages.

**Logo → accent picker (Settings)** — Canvas-based dominant-colour extractor
(`lib/extract-color.ts`) suggests an accent on logo upload. Also exposes
`--brand` CSS var separately from `--accent` so the global "+ New" button
stays on the company brand colour even on route-accented pages. Migration
**040** added `companies.theme_accent`.

**Automated review-request email on paid** — Migration **041**
(`companies.review_link`, `review_request_enabled`,
`invoices.review_request_sent_at`). `lib/review-request.ts maybeSendReviewRequest()`
is idempotent and called from both the Stripe webhook
(`payment_intent.succeeded`) and the in-app "Record payment" flow. Logs to
`communications`.

**Two-way SMS thread** — Migration **042** (`customer_messages`). Twilio
inbound webhook `/api/sms/inbound` matches sender phone to a customer.
Outbound `/api/sms/send`. Threaded bubble UI on `/customers/[id]` (15s polling,
owner/admin only). **TODO before going live: enable
`X-Twilio-Signature` verification in `/api/sms/inbound`.**

**Booking widget on website builder** — New `booking` website section type
with date + morning/afternoon time picker. Posts to the existing
`/api/site/lead` with `kind: 'booking'` — `source` is stamped accordingly so
owners can filter booking vs general enquiries. Preferred date/time stamped
into the enquiry description.

**SEO for Instant Website** — `proxy.ts` now path-preserves subdomain rewrites
so site-scoped routes work at the tenant's root. New `/sitemap.xml` +
`/robots.txt` per tenant. `generateMetadata` emits Open Graph, Twitter card,
and favicon from the company logo. **GBP sync stubbed** in `lib/gbp-sync.ts`
— Google Business Profile API needs manual approval we don't have yet.

**Tap to Pay scaffolding** — `/api/stripe/terminal/connection-token` +
`/api/stripe/terminal/payment-intent` (card_present, auto-capture). Mobile
side: `tradiee-mobile/lib/tap-to-pay.ts` with fetch helpers and a wiring
doc-comment. **Install pending: `@stripe/stripe-terminal-react-native` +
Apple's proximity-reader entitlement** before the iPhone flow works.

**Tab-accent + orange cleanup** — `bg-orange-500` etc. sweep across 43 files
→ `bg-[var(--accent,#f97316)]`. Quotes/Jobs/Invoices/Enquiries filter pills
now match the route accent (sky on customer-side routes, amber on supplier
routes, etc.).

**Settings reorg (beginner-friendly)** — Tabs now: **Business / Workflow /
Team / My profile / Integrations / Subscription**. Workflow owns the lists
(Job statuses, Tax rates, **Hourly rates** — renamed from "Billing rates"
because it collided with the subscription tab — Payment methods, Enquiry
inbox). Integrations tab gains live green-tick / amber-warning status cards
for Resend, Twilio, Stripe and Anthropic, showing exactly which env vars to
set.

**Website builder Theme card** — Shows uploaded logo as a click-to-sample
target. **Native EyeDropper** button (Chrome/Edge; feature-detected, hides
otherwise). **AI palette**: top-5 dominant colours from the logo as
one-click swatches (pure client-side, no API call). `extractPalette` +
`samplePixel` helpers in `lib/extract-color.ts`.

### Sprint 2 work (already on main)
**Projects (web, Team \$19/mo add-on)** — migration 039. Multi-stage projects
with PM, progress bar, money rollup; CRUD stages/contacts/subcontractors;
reassign jobs/invoices to a stage. Web-only — staff redirected to dashboard.

**Daily 6am AI to-do list** — migration 038 + `/api/daily-todos`. Per-user
todos from today's visits, quote follow-ups, overdue invoices, stale
enquiries, 7d+ stalled jobs. Persists incompletes (yesterday rolls forward),
auto-completes when source resolves, manually-completed never resurrected.

**AI rewrite + AI-draft-quote** — `/api/ai/rewrite` (tone presets) +
`/api/ai/draft-quote` (price-list-grounded, server-side re-validated).
`AIRewriteButton` on the New Enquiry modal; existing `SmartWriteButton`
elsewhere.

**Seat-cap upgrade prompts** — `lib/plans.ts` is the single source of truth
(trial/solo/team/pro + maxSeats + monthly). Invite + breach → confirm()
→ `/api/billing/change-plan` → invite. Server guard at `/api/auth/invite`.

**Global +New + Cmd/Ctrl-K search** — `/api/search` merges
jobs/customers/quotes/invoices (RLS-scoped). `GlobalSearch` palette + `NewMenu`.

**Mobile RBAC + custom statuses** — sync streams parameterised by
`profiles.role` + assigned jobs. Mobile tab nav hides Quotes/Invoices for
staff. Jobs list / detail / map all read per-company `job_statuses` via
`tradiee-mobile/lib/job-statuses.ts`.

**Mobile complete-and-signature** — WebView signature pad →
`/api/storage/signature` stores PNG as a job photo, then sets job to the
company's terminal status.

### Design system (Monday.com-inspired)
- **Font**: Figtree via `next/font`, exposed as Tailwind v4 `font-sans`.
- **Sidebar**: light shell. Each nav group owns a soft pastel hover gradient
  and a saturated active gradient.
- **CSS variables**:
  - `--accent` — route accent on mapped routes (sky on Customers/Jobs/Quotes
    etc., amber on Suppliers/POs/Bills, violet on Admin/Settings); falls
    back to `--brand` on unscoped routes.
  - `--brand` — the company's chosen theme accent (companies.theme_accent),
    drives the global "+ New" button and unscoped pages. Falls back to
    orange (`#f97316`) when unset.
  - `--accent-hover`, `--accent-soft`, `--accent-soft-text`, `--accent-ring`,
    `--brand-hover` derived in `DashboardShell`.
- `Button` default variant + focus rings consume the vars. Sprint 3
  finished the migration — there are now zero `bg-orange-500` /
  `text-orange-600` / `border-orange-500` literals in `app/(dashboard)` or
  `components/`.

### Everything else (pre-existing)
- **Instant Website builder** (`/website`): editable sections, theme
  colour+font, slug, SEO, logo. Public at `{slug}.industryforms.app`
  (proxy Host-rewrite → `/site/[slug]` — now path-preserving). Publish gated
  behind \$9/mo "website" Stripe add-on. **Custom domains** via
  Cloudflare-for-SaaS.
- **Discounts** + **configurable tax** centralised in `lib/pricing.ts`.
- **Role-based access** (migration 031): staff see only assigned jobs + own
  time/travel; quotes/invoices/payments/suppliers/POs/bills/enquiries
  owner-admin only.
- **Custom job statuses** (migration 037). **Reference fields** + doc number
  prefixes. **Recurring jobs/invoices**, **job templates**, **service reminders**,
  **quote templates**.
- **Customer communications history**. **Enquiry email inbox**
  (`/api/inbound/email`).
- Customers + multi-site (geocode-on-save), **Job Map** (web Leaflet),
  **Timesheets** (+travel logs), Job costing, Materials (+AI supplier-invoice
  parser "SmartRead"), **SmartWrite** + **VoiceFill**, Price list (+CSV
  import, low-stock), Suppliers/POs/Bills (AP), Forms/Compliance (NZ
  PS1–PS4, electrical certs), To-Do, Reports, Subcontractor invites,
  Customer portal (`/portal`), photos (R2), 28-day trial + paywall,
  super-admin + billing-exempt, **dunning cron** (`/api/reminders`).

### Mobile (Expo)
Tabs: Jobs (My/All), Map, Invitations, Schedule, **Quotes/Invoices (admin
only)**, Customers, Timesheets, More. Lists read **direct Supabase**; detail
screens use **PowerSync** `useQuery`; photos via presigned R2.
- **Job detail**: tap-to-call phone, tap-to-map address, custom-status
  badge + picker, **Complete job & get sign-off** (with photo prompt), **Complete & Invoice**.
- **New job**: inline new-customer create, uses `/api/jobs` for correct `job_number`.
- **Timesheets**: auto GPS travel logbook → allocate trips (Personal/Ignore/Work→job).
  Auto-track with **trading hours schedule** (configurable per day + hour window).
- **Sign-off modal**: "Customer Signature" label + photo prompt if no photos yet.
- **Tap to Pay** (scaffolding only — see Sprint 3/4 above).

## Migrations (supabase/migrations/) — all 046 applied to cloud
001–021 base schema. **022** PowerSync. **023** billing_exempt. **024**
visit reminder_sent_at. **025** suppliers/POs. **026** bills. **027** invoice
last_reminder_at. **028** company_websites. **029** cf_hostname_id. **030**
discounts. **031** role-based access. **032** reference + doc prefixes +
recurring jobs + job_templates + service_reminders. **033** payment_methods +
billing_rates + recurring invoices + doc branding. **034** configurable tax.
**035** job_tasks. **036** document_templates + communications +
inbound_email_token. **037** custom job statuses. **038** auto-generated todos.
**039** projects + project_stages + project_contacts + project_subcontractors
+ jobs/invoices.project_id/project_stage_id + companies.addons. **040**
companies.theme_accent. **041** review_link + review_request_enabled +
invoices.review_request_sent_at. **042** customer_messages. **043**
profiles.vehicle_registration. **044** project_subcontractors.company. **045**
companies.default_project_stages text[]. **046** travel_logs.verified_at +
travel_logs.verified_by.

## Key decisions & gotchas
- **Next 16** uses `proxy.ts` (not `middleware.ts`) + `allowedDevOrigins` in
  `next.config.ts`. Read `node_modules/next/dist/docs/` per
  `tradiee-app/AGENTS.md`. `proxy.ts` now **path-preserves** when rewriting
  subdomains/custom-domains → `/site/[slug]/<path>`.
- **PowerSync sync streams (edition 3)**: data queries must use **simple
  equality** with JOINs — no `IN ('owner','admin')` literal lists. Use
  `auth.user_id()` (not `request.user_id()`). The current `sync-rules.yaml`
  is the canonical example.
- **Turbopack dev manifest** on the slow D: drive sometimes returns 404 for
  all `/api/*` routes from a stale manifest. Restart the dev server.
- **Supabase clients must share the session** — use
  `@/lib/supabase/browser`/`server`, not a fresh `@supabase/supabase-js`.
- **Bearer auth fallback pattern (mobile API routes)**: try cookie auth via
  `createClient()`, then `createServiceClient().auth.getUser(bearer.slice(7))`.
  Used in `/api/jobs`, `/api/invoices`, `/api/storage/signature`, etc.
- **PostgREST to-one embeds infer as arrays** under the typed client —
  cast `as unknown as {…} | null`.
- **Lucide icon name collisions**: `import { Map }` shadows JS `Map` —
  use a Record/`Object.fromEntries`.
- **Server → client component boundary**: passing icon components
  (`icon: FileText`) across the boundary throws. Pass rendered elements
  (`icon: <FileText />`) instead — `RowActions` already enforces this in
  its type.
- **ESLint**: React-Compiler rules set to **warn**. `next build` fails on
  errors only.
- **Mobile npm installs need `--legacy-peer-deps`**.
- **Paywall** in `app/(dashboard)/layout.tsx` via `lib/billing.ts hasAccess()`.
- **Tax math** lives only in `lib/pricing.ts`.
- **Tailwind v4** JIT won't see template-string-concatenated classes — store
  full literal class strings on data objects.
- **Plans** in `lib/plans.ts`. Add-ons are JSONB on `companies.addons`,
  keyed by slug — `lib/billing.ts hasAddon()`.
- **`nextDocNumber(supabase, companyId, kind)`** in `tradiee-app/lib/numbering.ts`
  — count-based job/quote/invoice numbers. Always call it server-side via the API
  routes, never from client-side Supabase inserts.
- **EAS free plan** resets 2026-07-01. Until then, build APKs with
  `tradiee-mobile/android/gradlew.bat assembleRelease --no-daemon`. Output:
  `android/app/build/outputs/apk/release/app-release.apk`. Local EAS
  (`eas build --local`) requires macOS/Linux — won't work on Windows.

## How to run / verify
- **Web dev**: `npm run dev` in `tradiee-app` (port 3000) — talks to cloud
  Supabase/R2. First `/api/*` request can take 60s+ to compile on the slow
  D: drive.
- **Type-check**: `cd tradiee-app && npx tsc --noEmit` (and same in
  `tradiee-mobile`). **Lint**: `npx eslint .`. **Before pushing to `main`**
  (auto-deploys): `npx next build`.
- **DB**: `supabase db push`. One-off DB scripts: `node --env-file=.env.local
  <x>.mjs` with `@supabase/supabase-js` + secret key.
- **APK (Windows)**: `cd tradiee-mobile/android && gradlew.bat assembleRelease --no-daemon`
  (Java 17 + Android SDK required; Android Studio handles SDK).
- **Commits** end with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

## Accounts
- **E2E test** (exists): `claude-e2e-20260620@grimstock.co.nz` /
  `SmokeTest1234`, company "E2E Test Co". Safe to delete.
- To create: **owner/super-admin** `admin@industryforms.co.nz` (then `update
  profiles set is_super_admin=true …`); **app-store review**
  `test@industryforms.co.nz` (set its `companies.billing_exempt=true`).

## Outstanding / next steps

### Imminent (before going fully live)
1. **Resend** — set `RESEND_API_KEY` + `EMAIL_FROM` in Vercel, then redeploy.
   Quote/invoice/reminder/review-request emails all no-op cleanly until this
   is set. Settings → Integrations shows the live status.
2. **Stripe** — set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET`. Webhook target: `/api/stripe/webhook`. Create
   Stripe prices including `website_monthly` (\$9/mo) and `projects_monthly`
   (\$19/mo). Without this: online invoice pay + plan upgrades + Tap to Pay
   are all dark.
3. **Twilio inbound signature verification** — currently disabled in
   `/api/sms/inbound` (see TODO). Verify `X-Twilio-Signature` before going
   live so the webhook can't be spoofed.
4. **Wildcard domain `*.industryforms.app`** in Vercel + DNS for free
   per-tenant website subdomains.
5. **Cloudflare for SaaS** — `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID`
   (+ optional `CLOUDFLARE_SAAS_FALLBACK_HOSTNAME`) for website custom domains.
6. **Stripe webhook handler for Projects add-on** — `/api/billing/addon`
   currently flips `companies.addons.projects.active` directly. Fine for
   dev/super-admin; needs a Stripe checkout + webhook for prod.

### Building next
No explicit next sprint scoped yet. Leading candidates:
- **Marketing site** (industryforms.app — separate from tenant Instant Websites). No work started.
- **Configurable dashboard widgets** (swappable widget system).
- **Job maps: geocode-on-save** when a new site address is set.

### Future backlog (in priority order)
- **Tap to Pay finish** — install `@stripe/stripe-terminal-react-native` in
  the mobile app, get Apple's proximity-reader entitlement, wire the
  collect-confirm flow per `tradiee-mobile/lib/tap-to-pay.ts`.
- **Google Calendar sync** — not yet implemented.
- **GPS geo-fence time clock** — auto check-in on site arrival.
- **Customer portal login** — customers view their own job/invoice history.
- **Pricing levels** (per-customer-group pricing). **MYOB/QuickBooks** sync
  (have Xero). **Reminder-cron comms logging** (manual sends are logged;
  cron sends aren't). **Invoice templates** standalone (currently lean on
  recurring invoices).
- **Mobile Projects view** — projects feature is web-only by spec, but
  field crews seeing the stage they're on would help.
- **Google Business Profile sync** — stubbed in `lib/gbp-sync.ts`. Needs
  Google to approve API access before wiring.
- **Per-screen accent on remaining chips/pills** — most done in sprint 3,
  but spot-check on edge pages.

## Memory (auto-loaded each session, at `C:\Users\User\.claude\projects\D--TRADIEE\memory\`)
- `project-overview.md`, `tech-stack.md`, `build-state.md`,
  `feedback_nextjs16_allowedDevOrigins.md`, `gotcha_turbopack_stale_api_404.md`,
  `tradify-parity-backlog.md`.
