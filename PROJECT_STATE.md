# IndustryForms — Project State (handoff)

Last updated: 2026-06-22. Catch-up doc for a fresh session. Read this first.

## What it is
**IndustryForms** — a SaaS job-management app for NZ/AU tradespeople (a Tradify
competitor). Monorepo at `D:\TRADIEE`:
- `tradiee-app/` — **Next.js 16** web app (App Router, Turbopack)
- `tradiee-mobile/` — **Expo SDK 56** mobile app (bare workflow, native `android/` dir)
- `supabase/migrations/` — database migrations (001–039)
- Root docs: this file, `POWERSYNC_SETUP.md`, `R2_SETUP.md`, `SUPABASE_CLOUD_MIGRATION.md`, `VERCEL_DEPLOY.md`, `sync-rules.yaml`

GitHub: **https://github.com/NZGrimstock/industryforms** (branch `main`, auto-deploys to Vercel).

### ⚠ Where work lives right now
**Active branch:** `feature/outstanding-backlog` (pushed, not merged). Big sprint
covering mobile RBAC/statuses, global search/+New, AI rewrite + auto-quote,
seat-cap upgrade prompts, daily AI to-do cron, Projects feature, full design
refresh (Figtree + gradient sidebar + per-route accents). `main` is still on
`cfe810f`. Open PR at: `https://github.com/NZGrimstock/industryforms/pull/new/feature/outstanding-backlog`.

`next build` passes on the branch (verified locally).

### ⚠ Manual deploy steps before merging
1. **Re-upload `sync-rules.yaml` via PowerSync Dashboard → Sync Rules** — the
   YAML was rewritten into role-aware buckets (owner/admin sync the whole
   company; staff sync only their assigned jobs + own time, never quotes/
   invoices). Editing the file does nothing on its own.
2. **Apply migrations 038 + 039** via `supabase db push` (auto-todos schema, projects schema).
3. (Optional) Add a daily Vercel cron secret if `CRON_SECRET` isn't set — the
   `/api/daily-todos` schedule won't run without it.

## Live infrastructure (all provisioned)
| Piece | Detail |
|---|---|
| **Supabase** | Cloud project ref `cfltbpwrojtlpkjvresd` (Sydney/SEA). **New API keys**: publishable (client) + secret (server) — NOT legacy anon/service_role. Migrations 001–037 applied to cloud; 038–039 still local. |
| **Web hosting** | **Vercel**, custom domain **app.industryforms.app**. Vercel **Root Directory = `tradiee-app`**, **Framework Preset = Next.js**. `tradiee-app/vercel.json` defines two daily crons (`/api/reminders` 20:00 UTC, `/api/daily-todos` 18:00 UTC = 6am NZ). |
| **Storage** | **Cloudflare R2** (S3-compatible). Buckets: `industry-forms-public` (logos, job photos, customer sign-offs — via **cdn.industryforms.app**) and `industry-forms` (private compliance PDFs via presigned URLs). |
| **Offline sync** | **PowerSync** `https://6a33b406deeddd0df605d498.powersync.journeyapps.com`, connected to cloud DB, JWKS auth via Supabase. `sync-rules.yaml` is now role-aware — needs upload. |
| **Mobile** | Expo `@grimstock/industryforms` (EAS, logged in as `grimstock`). APK builds via **local Gradle**: `cd tradiee-mobile/android && ./gradlew assembleRelease --no-daemon`. Don't run release builds back-to-back — flaky `packageRelease` lock errors; if it fails run `./gradlew clean assembleRelease`. |

## Env vars (NEVER commit real secret values)
Web `tradiee-app/.env.local` (mirror non-secret ones in **Vercel**):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `R2_ACCOUNT_ID`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_*`/`R2_PRIVATE_*` keys, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://cdn.industryforms.app`
- `NEXT_PUBLIC_APP_URL=https://app.industryforms.app`, `NEXT_PUBLIC_POWERSYNC_URL`, `CRON_SECRET`
- **Placeholders — features no-op/gate gracefully until set:** `RESEND_API_KEY`+`EMAIL_FROM`; `TWILIO_*`; `STRIPE_*`; `XERO_CLIENT_ID/SECRET`; `GOOGLE_CLIENT_ID/SECRET` (real value present); `ANTHROPIC_API_KEY`; `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID` (+optional `CLOUDFLARE_SAAS_FALLBACK_HOSTNAME`); `INBOUND_EMAIL_SECRET`.

Mobile `tradiee-mobile/.env` + `eas.json` carry `EXPO_PUBLIC_*` equivalents (client-public, baked into builds).

## Features built

### Core workflow
**Enquiries** (+convert, dup-detection; sources incl. website + email inbox;
**AI-draft-quote** from the convert dialog grounds line items in the price list)
→ **Quotes** (builder with sections, price-list, kits, optional sections + online
accept/decline, per-line + document **discounts**, per-line **tax**,
**gross-profit** display, **save-as-template** / new-from-template, public
`/q/[token]`, email/SMS) → **Jobs** (list/board/map, detail, **custom statuses**,
assign to team member, **per-job tasks**, recurring) → **Scheduling** (visits,
Google Calendar sync) → **Invoicing** (full/progress/actuals, line items +
discounts + per-line tax + tax-inclusive mode, payments incl. **Stripe**,
**Xero** sync, recurring invoices, bulk invoicing, email/SMS, public `/i/[token]`)
→ **Payments**.

### New on `feature/outstanding-backlog`

**Projects (web, Team $19/mo add-on)** — migration 039.
- `/projects` list (card-per-project: PM, progress bar, status pill, money,
  job count, target end). `+ New Project` seeds default stages.
- `/projects/[id]` detail: hero with live `% complete` + money rollup;
  stages with status-cycle + reorder + CRUD; **main contacts** CRUD; **sub-
  contractors** CRUD; **reassign jobs/invoices to a stage** picker;
  "unstaged" bucket; edit project header.
- Schema: `projects`, `project_stages`, `project_contacts`, `project_subcontractors`;
  `jobs.project_id / project_stage_id`; `invoices.project_id / project_stage_id`;
  `companies.addons jsonb` ({"projects": {"active": true}}).
- Billing gate: `hasAddon()` (`lib/billing.ts`); upsell pane at `/projects`
  when add-on inactive; `/api/billing/addon` flips the flag (owner/admin only;
  Stripe webhook will own this in prod).
- Web only. Staff redirect to `/dashboard`.

**Daily 6am AI to-do list** — migration 038 + `/api/daily-todos`.
- Cron at 18:00 UTC (= 6am NZST) generates per-user todos from today's visits,
  quote follow-ups, overdue invoices (owners/admins), stale enquiries, and 7d+
  stalled in-progress jobs.
- Persists incompletes: yesterday's pending auto-todos roll forward to today.
- Auto-completes when source artefact is resolved (quote viewed, invoice paid,
  visit done, enquiry quoted/won/lost, job no longer in_progress).
- Manually-completed never resurrected. Idempotent: partial unique index on
  `(assigned_to, source_type, source_id) where is_auto`.

**AI rewrite + AI-draft-quote** — `/api/ai/rewrite` (tone presets: clean/
professional/friendly/shorter/longer) + `/api/ai/draft-quote` (grounded in the
company's active price list, re-validated server-side so the model can't smuggle
bad ids/prices). New tone-menu `AIRewriteButton` on the New Enquiry modal.
Existing `SmartWriteButton` (one-click clean) stays where it already was.

**Seat-cap upgrade prompts** — `lib/plans.ts` is the single source of truth
(trial/solo/team/pro + maxSeats + monthly). Inviting a team member that would
breach the cap shows a confirm("this will upgrade to Team \$79/mo — continue?"),
calls `/api/billing/change-plan` then sends the invite. Server-side guard in
`/api/auth/invite` returns 402 if the client tries to bypass.

**Global +New + Cmd/Ctrl-K search** — `/api/search` merges jobs/customers/
quotes/invoices (RLS-scoped). `GlobalSearch` palette + `NewMenu` (incl. Projects)
in the header on every dashboard page.

**Mobile RBAC + custom statuses** — `sync-rules.yaml` parameterised by
`profiles.role` + assigned jobs. Mobile tab nav hides Quotes/Invoices for staff.
Jobs list / job detail / map's active filter all read per-company `job_statuses`
via `tradiee-mobile/lib/job-statuses.ts`.

**Mobile complete-and-signature** — WebView signature pad → new
`/api/storage/signature` stores PNG as a job photo, then sets the job to the
company's terminal status. Captures customer sign-off in one screen.

**Web workflow polish** — inline status editing on the jobs list
(`components/jobs/inline-status.tsx`); one-click **Complete & invoice** on
the Job Card.

### Design system (Monday.com-inspired)
- **Font**: Figtree (Monday's brand typeface) via `next/font`, exposed as
  Tailwind v4 `font-sans`.
- **Sidebar**: light shell. Each nav group owns a soft pastel hover gradient
  and a saturated active gradient. Group icons inherit the hue when not active.
  Top-level items (no group) live above the groups with their own gradients:
  - Dashboard       — orange → amber → yellow
  - Projects        — sky → cyan → emerald
  - Customers/Jobs  — sky → cyan → emerald (hover)
  - Suppliers/Orders — amber → orange → rose
  - Admin           — violet → fuchsia → pink
- **Per-route accent palette** (`lib/route-accent.ts` + `DashboardShell`):
  the first-path-segment maps to an `Accent` whose hex values are set as
  CSS variables (`--accent`, `--accent-hover`, `--accent-soft`,
  `--accent-soft-text`, `--accent-ring`). `Button` default variant + focus
  ring consume the vars (with orange fallback for unscoped/public pages).
  The global `+ New` button and the brand chrome stay orange — single
  brand cue across the app.

### Everything else (pre-existing)
- **Instant Website builder** (`/website`): editable sections, theme colour+font, slug, SEO, logo. Public at `{slug}.industryforms.app` (proxy Host-rewrite → `/site/[slug]`). Publish gated behind \$9/mo "website" Stripe add-on. **Custom domains** code-complete via Cloudflare-for-SaaS.
- **Discounts** + **configurable tax** centralised in `lib/pricing.ts`. NZ 15% / AU 10%.
- **Role-based access** (migration 031): staff see only assigned jobs + own time/travel; quotes/invoices/payments/suppliers/POs/bills/enquiries owner-admin only.
- **Custom job statuses** (migration 037): `jobs.status` is text; per-company `job_statuses` table; drives board columns, list filters, badges, status picker.
- **Settings**: Company (logo, GST, doc number prefixes, payment instructions/footers, tax-inclusive toggle), Profile, Team, Integrations tab (Google Calendar, Xero, Import wizard), Billing (plan). Plus managers: tax rates, billing rates, payment methods, job statuses, enquiry email-inbox address.
- **Reference field** on jobs/quotes/invoices. **Configurable doc numbering** (`lib/numbering.ts`). **Tabbed + searchable + sortable list views** via `ListSearch` + `SortHeader`.
- **Recurring jobs** + **job templates** + **service reminders**. **Recurring invoices** + **bulk invoicing**. **Quote templates** (`document_templates`).
- **Customer communications history**. **Enquiry email inbox** (`/api/inbound/email` webhook → enquiry).
- Customers + multi-site (geocode-on-save), **Job Map** (web Leaflet), **Timesheets** (+travel logs), Job costing, Materials (+AI supplier-invoice parser "SmartRead"), **SmartWrite** + **VoiceFill**, Price list (+CSV import, low-stock), Suppliers/POs/Bills (AP), Forms/Compliance (NZ PS1–PS4, electrical certs), To-Do, Reports, Subcontractor invites, Customer portal (`/portal`), photos (R2), 28-day trial + paywall, super-admin + billing-exempt, **dunning cron** (`/api/reminders`).

### Mobile (Expo)
Tabs: Jobs (My/All), Map, Invitations, Schedule, **Quotes/Invoices (admin only)**, Customers, Timesheets, More. Lists read **direct Supabase**; detail screens use **PowerSync** `useQuery`; photos via presigned R2.
- **Job detail**: tap-to-call phone, tap-to-map address. Custom-status badge + picker (reads `job_statuses`). **Complete job & get sign-off** button (signature WebView → upload).
- **Timesheets**: auto GPS travel logbook (`lib/location/tracking.ts`) → allocate trips (Personal/Ignore/Work→job).

## Migrations (supabase/migrations/) — 001–037 applied to cloud, 038–039 local
001–021 base schema. **022** PowerSync. **023** billing_exempt. **024** visit reminder_sent_at. **025** suppliers/POs. **026** bills. **027** invoice last_reminder_at. **028** company_websites. **029** cf_hostname_id. **030** discounts. **031** role-based access. **032** reference fields + doc prefixes + recurring jobs + job_templates + service_reminders. **033** payment_methods + billing_rates + recurring invoices + doc branding. **034** configurable tax. **035** job_tasks. **036** document_templates + communications + inbound_email_token. **037** custom job statuses. **038** auto-generated todos (is_auto/source_type/source_id + partial unique). **039** projects + project_stages + project_contacts + project_subcontractors + jobs/invoices.project_id/project_stage_id + companies.addons.

## Key decisions & gotchas
- **Next 16** uses `proxy.ts` (not `middleware.ts`) + `allowedDevOrigins` in `next.config.ts`. Read `node_modules/next/dist/docs/` per `tradiee-app/AGENTS.md`. `proxy.ts` also handles website subdomain + custom-domain Host→tenant rewrites.
- **Turbopack dev manifest** on the slow D: drive sometimes returns 404 for all `/api/*` routes from a stale manifest (reproduced on the pre-existing `/api/reminders`). It looks like a route bug; it's not. Restart the dev server — a fresh start rediscovers routes. See memory `gotcha_turbopack_stale_api_404`.
- **Supabase clients must share the session** — use `@/lib/supabase/browser`/`server`, not a fresh `@supabase/supabase-js` client.
- **PostgREST to-one embeds infer as arrays** under the typed client — cast `as unknown as {…} | null`.
- **Lucide `Map`/icon name collisions**: `import { Map }` shadows JS `Map` — use a Record/`Object.fromEntries`, not `new Map()`, in files importing the icon.
- **ESLint**: React-Compiler rules set to **warn** (they flag valid server-component/effect code). `next build` fails on errors only — keep errors 0; the `set-state-in-effect`/`immutability` *warnings* are expected. Lazy-init SDK clients.
- **Mobile npm installs need `--legacy-peer-deps`**. To add a native dep: `npm install <pkg> --legacy-peer-deps` then rebuild APK.
- **Geocoding**: once on site save (`lib/geocode.ts`, Nominatim) → `customer_sites.lat/lng`. `scripts/geocode-sites-backfill.mjs` backfills.
- **Paywall** in `app/(dashboard)/layout.tsx` via `lib/billing.ts hasAccess()`.
- **Tax math** lives only in `lib/pricing.ts` — change it there.
- **Tailwind v4** JIT won't see template-string-concatenated classes — store full literal class strings on data objects (see `sidebar.tsx`).
- **Plans** live in `lib/plans.ts` (single source of truth: trial/solo/team/pro + maxSeats + monthly). Add-ons are JSONB on `companies.addons`, keyed by slug — `lib/billing.ts hasAddon()` is the gate.

## How to run / verify
- **Web dev**: `npm run dev` in `tradiee-app` (port 3000) — talks to cloud Supabase/R2. First `/api/*` request can take 60s+ to compile on the slow D: drive.
- **Type-check**: `cd tradiee-app && npx tsc --noEmit` (and same in `tradiee-mobile`). **Lint**: `npx eslint .` (errors 0; warnings ok). **Before pushing to `main`** (auto-deploys): `npx next build`.
- **DB**: `supabase db push`. One-off DB scripts: `node --env-file=.env.local <x>.mjs` with `@supabase/supabase-js` + secret key (delete temp scripts after).
- **Commits** end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push `main` → Vercel deploys.

## Accounts
- **E2E test** (exists): `claude-e2e-20260620@grimstock.co.nz` / `SmokeTest1234`, company "E2E Test Co". Safe to delete.
- To create: **owner/super-admin** `admin@industryforms.co.nz` (then `update profiles set is_super_admin=true …`); **app-store review** `test@industryforms.co.nz` (set its `companies.billing_exempt=true`).

## To go fully live (set in Vercel, then redeploy)
`RESEND_API_KEY`+`EMAIL_FROM`, `TWILIO_*`, `STRIPE_*` (+ create Stripe prices incl. `website_monthly` @ \$9/mo and `projects_monthly` @ \$19/mo), `CRON_SECRET` (enables both daily crons), `*.industryforms.app` **wildcard domain** in Vercel + DNS (free website subdomains), `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID` (website custom domains), `INBOUND_EMAIL_SECRET` + email-provider inbound webhook → `/api/inbound/email`.

## Outstanding / next steps
1. **Merge `feature/outstanding-backlog` to `main`** after:
   - Re-uploading `sync-rules.yaml` to PowerSync (now sync-streams edition 3 — JOIN form).
   - Migrations 038 + 039 already pushed (2026-06-22).
   - Reviewing the PR and the visual changes.

### Next sprint — competitor-parity & differentiators (queued 2026-06-22)
Ordered roughly by ROI / effort. Each is its own commit/PR.
1. **Quick-action menus on list rows** — Tradify just shipped this in 2026. Per-row `⋯` on Quotes/Customers/Suppliers/Invoices/Jobs that opens "New job / quote / invoice / PO / bill" pre-filled with that row's customer or supplier. ~1 day.
2. **Logo → accent picker** — on logo upload (Settings → Company), extract a dominant non-white colour and offer it as the default theme accent. Re-uses the existing `lib/route-accent.ts` shape. Small client-side color-extract (e.g. `node-vibrant`) + write to `companies.theme_accent`. ~1 day.
3. **Automated review-request emails on invoice paid** — hook into the existing invoice payment path; send a Resend email with a Google review link (per-company `companies.review_link` setting). Optional follow-up after 7d if not actioned. Log to communications.
4. **Two-way SMS thread** — Twilio inbound webhook → store on a new `customer_messages` table; thread view in customer detail. Outbound sends already exist in places — unify under one sender.
5. **Booking widget for the website builder** — public `/site/[slug]/book` form posting to `/api/enquiries/public` (already wired for the enquiry inbox). Toggle in website builder section.
6. **Integrated SEO + Google Business Profile sync** — meta description / OG image / sitemap / robots auto-generated from website builder content; optional GBP API push for hours + photos.
7. **Tap-to-Pay on phone** — Stripe Terminal SDK (Tap to Pay on iPhone/Android). Needs Stripe Connect express accounts per company. Largest scope; do last.

### Pre-existing backlog
- **Stripe wiring for the Projects add-on**: create the \$19/mo `projects_monthly` price and a webhook handler that flips `companies.addons.projects.active`. Today `/api/billing/addon` flips it directly (no payment) — fine for dev/super-admin; needs Stripe for prod.
- **Pricing levels** (per-customer-group pricing). **MYOB/QuickBooks** sync (have Xero). **Reminder-cron comms logging** (manual sends are logged; cron sends aren't). **Invoice templates** standalone (currently lean on recurring invoices).
- **Mobile Projects view** (deferred — Projects is intentionally web-only per the spec, but field crews seeing the stage they're on would help).

## Memory (auto-loaded each session, at `C:\Users\User\.claude\projects\D--TRADIEE\memory\`)
- `project-overview.md`, `tech-stack.md`, `build-state.md`, `feedback_nextjs16_allowedDevOrigins.md`, `gotcha_turbopack_stale_api_404.md`, `tradify-parity-backlog.md`.
