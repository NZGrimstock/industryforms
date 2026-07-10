# IndustryForms — Project State (handoff)

Last updated: 2026-07-11. Catch-up doc for a fresh session. Read this first.

## What it is
**IndustryForms** — a SaaS job-management app for NZ/AU tradespeople (a Tradify
competitor). Monorepo at `D:\TRADIEE`:
- `tradiee-app/` — **Next.js 16** web app (App Router, Turbopack)
- `tradiee-mobile/` — **Expo SDK 56** mobile app (bare workflow, native `android/` dir)
- `supabase/migrations/` — database migrations (001-046 cloud-applied; 20260707 local migrations pending deploy verification)
- Root docs: this file, `POWERSYNC_SETUP.md`, `R2_SETUP.md`, `SUPABASE_CLOUD_MIGRATION.md`, `VERCEL_DEPLOY.md`, `sync-rules.yaml`

GitHub: **https://github.com/NZGrimstock/industryforms** (branch `main`, auto-deploys to Vercel).

### Where work lives right now
**`main` is current** — Growth Engine Sprints A through E all merged
(A/B/C/D on 2026-07-03/04, E on 2026-07-06), executing
`SPRINTS_GROWTH_ENGINE_RESCOPED.md` in full (see that file +
`SPRINT_A_INBOX_EXECUTION.md` for the original sprint plan). **The Growth
Engine roadmap is now complete** — no more sprints scoped in that doc.
Migrations now mix older `0XX_` files with timestamped filenames
(`YYYYMMDDHHMMSS_description.sql`). Cloud Supabase was last confirmed through
the older applied set; the 2026-07-07 local migrations listed below still need
deploy verification. PowerSync sync rules switched to **streams (edition 3)**
— already validated + deployed via the PowerSync Dashboard.
Latest APK is `tradiee-mobile/android/app/build/outputs/apk/release/app-release.apk`
(built 2026-07-11 08:52 NZT, 148,773,857 bytes, SHA256
`499126468a2101da46cbf168e9f668bef548bd1f6f1bb618ec28ce16b34dc07f`). This
build carries every mobile fix through the Job Map locate-retry commit
(`ec99cc5`) — see `git log` for current commit hashes if this line goes
stale. Build log: `tradiee-mobile/release-build-jobmap-fix.log` (`BUILD
SUCCESSFUL`, 6m28s — fast because most native modules were already
compiled from the prior clean build). The `release-build-schedule-fix2.log`
build (2026-07-11 07:55 NZT, `BUILD SUCCESSFUL`, 14m56s) preceded it and is
superseded. The rebuild attempt before that
(`release-build-schedule-fix.log`) failed with a stale `.cxx` CMake cache
error (`Access is denied` on a leftover `c:/users/codexsandboxonline/...`
path baked into `android/app/.cxx` and six `node_modules/*/android/.cxx`
dirs from a previous machine/sandbox) — same class of issue as before;
fixed by deleting all `.cxx` dirs under `android/app` and the affected
`node_modules` packages (`@journeyapps/react-native-quick-sqlite`,
`expo-modules-core`, `expo-updates`, `react-native-gesture-handler`,
`react-native-reanimated`, `react-native-screens`, `react-native-worklets`)
and rebuilding clean. If a build ever fails again with an "Access is
denied" error mentioning a path that isn't this machine's, that's the
signature — delete `.cxx` dirs, don't debug the code.

**⚠ Git history was rewritten once, locally only, 2026-07-11 (Claude).**
A commit meant to untrack `.android-sdk/` (~77k files, added by an earlier
broad `git add` on 2026-07-10) still left those blobs — some over
GitHub's 100MB hard limit — reachable in history, so every push attempt
was rejected (`GH001: Large files detected`). The same earlier commit had
also swept in `.tmp/` and `.npm-cache/` (untracked local cache dirs,
also not gitignored at the time). Since none of the 4 affected commits
had ever reached `origin` (confirmed via `git log origin/main..HEAD`
before touching anything), it was safe to rewrite: `git reset --soft`
back to origin's tip, drop the SDK/tmp/npm-cache paths from the index,
add `.npm-cache/` and `.tmp/` to `.gitignore` alongside `.android-sdk*`,
and recommit clean. A safety-net branch `backup-pre-sdk-cleanup` was left
pointing at the old (unpushed, blob-heavy) tip in case anything here
needs to be recovered — safe to delete once the push below is confirmed
and nothing is missing. **If you ever see a push rejected with
`GH001: Large files detected` again, check `git log --stat` on the
rejected commits for accidental broad `git add`/`git add -A` sweeps of
`.android-sdk*`, `.tmp/`, `.npm-cache/`, or similar local-only dirs before
assuming it's a real vendored dependency that needs Git LFS.**

Mobile Projects view was added on 2026-07-08; iOS EAS
production build was attempted non-interactively and blocked at Apple/EAS
credential setup. Run `cd tradiee-mobile && npx eas build --platform ios
--profile production` interactively after Apple credentials are available.

**Backlog build batch (Codex, 2026-07-08):**
- Added Stripe-owned add-ons for Projects and SMS usage. `/api/billing/addon`
  now sends normal companies to Checkout/Portal; only super-admin/billing-
  exempt accounts direct-toggle add-ons. Stripe webhook now handles
  `projects`, `bookings_website`, and `sms_usage` metadata. SMS opt-in is in
  Settings → Subscription and outbound SMS writes `sms_usage_events`, reports
  Stripe meter events, and retries failed meter rows from the reminders cron.
- Added migrations `20260707211441_billing_addons_sms_usage.sql` and
  `20260707212320_customer_group_pricing.sql`.
- Added customer-group pricing: groups in Price List, per-item group override
  prices, customer assignment, and quote/job/invoice price resolution.
- Added standalone invoice templates: save invoice as template, `/invoices/templates`,
  and create draft invoice from a template + customer.
- Added mobile Projects list with current stage/progress, plus PowerSync schema
  and `sync-rules.yaml` project/project_stage streams. Upload the updated sync
  rules in PowerSync before relying on offline project data.
- Removed end-user Settings cards for admin/provider integrations
  (Resend/Twilio/Stripe/Anthropic). Keep provider health in the admin console.
- Spot-cleaned remaining accent-owned chips/pills in quote builder, website,
  voice input, and settings; semantic status/warning colours remain.
- Added first-run welcome/tutorial overlay (2026-07-08): animated transparent
  Welcome screen, liquid-glass benefits walkthrough, differentiator list, and
  Settings replay button. Persistence flag is
  `profiles.welcome_tutorial_seen_at` via migration
  `20260708021858_welcome_tutorial_seen.sql`.
- Switched the highest-value AI workflows to OpenAI Responses API model
  routing: supplier invoice parsing uses `gpt-5.4-nano` first with
  `gpt-5.4-mini` fallback, AI quote drafting uses `gpt-5.4-mini`, and the
  daily to-do cron keeps deterministic DB task selection but lets
  `gpt-5.4-nano` polish the morning list wording. Shared helper:
  `tradiee-app/lib/openai.ts`.
- UI/product cleanup pass (Codex, 2026-07-08): quote scope rows and job
  materials now support immediate price-list autocomplete in the Description
  field, keyboard-first entry (Enter advances through line fields; shared
  dialogs already close with Escape), and jobs Materials & parts opens ready
  to type with only `Price List Lookup`, `Add sundry`, and `Add kit` actions
  across the bottom. Jobs detail order is now Tasks → Materials & parts, with
  Recurring moved below Photos.
- Price List kits were clarified as bundle records, not standard price-list
  items. Kits now have their own list with SKU/code, name, sell price, computed
  cost from component items, an option to sum component sell prices, and inline
  creation of missing standard items. Adding tracked items/kits to jobs or
  invoices warns `no stock of xxx - do you wish to continue?` and consumes
  tracked inventory via `consume_price_list_stock`.
- Signup now creates companies with test mode on by default; login/signup
  forms submit with Enter. Dashboard widget normalisation forces To-Do into
  visible slot #2 unless hidden. `/reports` was rebuilt around period filters
  (1/3/6 months, 1/2/5 years, all time), visible period labels, drill-down
  rows, status drill links, and print/PDF-friendly output via a Print button.
  Verified with `npx tsc --noEmit` and scoped ESLint on touched web files.
- Mobile line-item parity pass (Codex, 2026-07-10): jobs now show an
  always-visible Materials entry box on mobile, matching quote-style line
  item entry with Description autocomplete against active price-list items,
  Qty, Unit, Unit price, and direct insert into `job_materials`. Mobile new
  quotes and quote detail line-item Description inputs now share the same
  price-list lookup. Customer-visible branding audit found and fixed missing
  company logos in review-request emails, booking request/confirmation emails,
  quote/invoice reminder emails, booking/win-back/service reminder snippets,
  customer portal magic-link emails, ETA fallback emails, job-sheet PDFs, and
  the mobile customer sign-off sheet. Reality checked with
  `cd tradiee-mobile && npx tsc --noEmit` and
  `cd tradiee-app && npx tsc --noEmit` after edits.
- Mobile add-item/keyboard fix (Codex, 2026-07-10/11): job Materials now add
  optimistically after Supabase insert so the line does not disappear while
  PowerSync catches up; focused mobile fields scroll to the top of the screen;
  quote/job material entry screens use Android `KeyboardAvoidingView`
  `height` behavior plus extra bottom padding so the keyboard no longer
  covers Qty/Unit/Unit price/Add controls. Touched files:
  `tradiee-mobile/app/jobs/[id].tsx`,
  `tradiee-mobile/app/quotes/new.tsx`,
  `tradiee-mobile/app/quotes/[id].tsx`,
  `tradiee-mobile/components/PriceListDescriptionInput.tsx`, and
  `tradiee-mobile/lib/keyboard.ts`. Reality checked with
  `cd tradiee-mobile && npx tsc --noEmit`, then rebuilt local release APK at
  `tradiee-mobile/android/app/build/outputs/apk/release/app-release.apk`
  (2026-07-10 21:29 NZT, SHA256
  `284c1736dbb9c51ec18cf3ed8024bcaf55a8c4e89def976b9bdd200909784a04`).

**Web perf + mobile keyboard/materials fixes (Claude, 2026-07-10):** Note the
attribution overlap with the Codex mobile entry above — both sessions worked
the same mobile add-item/keyboard problem; the descriptions below are what
actually landed in git. Commits `707c725` and `1c3f22f` are real, unchanged
hashes (pushed, on origin). The third piece of work described here (mobile
optimistic materials round 2) originally shipped as commit `1d92557`, which
was later rewritten during the 2026-07-11 git-history cleanup above — see
`git log` for its current hash, the content is unchanged.

- **Web query-waterfall fix (`1c3f22f`) — live on Vercel, verified with
  `npx tsc --noEmit`.** This is the fix for "opening jobs/quotes tabs lags
  badly" and "adding a material takes up to 10 seconds". Root cause was NOT
  the database or the D: drive (production is Vercel+Supabase) — it was
  sequential `await supabase...` calls in Server Components, each paying full
  round-trip latency. Collapsed the independent queries into a single
  `Promise.all` wave on `jobs/[id]/page.tsx` (worst offender: ~10 sequential
  round trips, one awaited inline in the JSX), plus `jobs/page.tsx`,
  `quotes/[id]/page.tsx`, `quotes/[id]/edit/page.tsx`, `quotes/new/page.tsx`,
  `enquiries/page.tsx`, `enquiries/[id]/page.tsx`, `projects/page.tsx`,
  `purchase-orders/new/page.tsx`, `suppliers/[id]/page.tsx`. Separately,
  `jobs/[id]/materials.tsx` (WEB) called `router.refresh()` after every
  add/remove — re-running the whole page waterfall for one row (the real
  "10 seconds to add an item" cause). Now updates optimistically from the
  insert's `.select().single()` response; `router.refresh()` runs in the
  background only to keep job-costing figures elsewhere in sync.

- **Mobile keyboard + first-launch + name-split (`707c725`):** added a shared
  `scrollFieldAboveKeyboard` helper (`tradiee-mobile/lib/keyboard.ts`) and
  wired `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` into
  the two form screens that were missing them entirely (`jobs/[id].tsx`,
  `quotes/[id].tsx`) plus `quotes/new`, `jobs/new`, `todos`, `timesheets`,
  `profile`. `app/index.tsx` now checks `getSession()` before redirecting so a
  fresh install lands on `/login`, not the jobs tab. Customer name entry
  (mobile + web) split into First/Last, joined into the existing single
  `name` column on save. PO supplier emails now carry the company logo.

- **Mobile optimistic materials, round 2:** `jobs/[id].tsx`
  `addMaterial()` now appends the inserted row to a local
  `optimisticMaterials` state and renders `displayedMaterials` (synced ∪
  optimistic, deduped by id) — so a newly-added material shows immediately
  instead of vanishing while PowerSync's local SQLite catches up. This is the
  correct fix for "tap Add item → loads a second → goes back to blank": the
  earlier `refreshMaterials?.()`-only version re-queried local SQLite that
  didn't have the row yet. Also tuned the description-field scroll and the
  quote/job KeyboardAvoidingView offsets.

- **Both follow-ups from the above are now resolved (Claude, 2026-07-11):**
  1. `.android-sdk` through `.android-sdk4` (~77k build-tool binaries across
     all four copies), plus `.tmp/` and `.npm-cache/` (found during the
     history cleanup above), untracked from git and added to `.gitignore`.
     Files remain on disk for local builds; the repo just no longer carries
     them.
  2. A fresh release APK build was kicked off (see next entry below) so the
     stale-APK problem doesn't recur — check that entry for the current
     APK's build time/SHA256 before assuming any mobile fix is testable.

**Auto-track schedule fixes + web trip allocation (Claude, 2026-07-11):**
- **Answering "can auto-track turn off/on on a schedule so it doesn't drain
  battery in the background":** the schedule feature already existed
  (Timesheets → gear icon → "Auto-track schedule"), but it only self-checked
  when the Timesheets screen was opened/focused — meaning once tracking
  started, nothing made it stop again if the app was never reopened after
  the window closed. Fixed the actual battery risk: the location background
  task in `tradiee-mobile/lib/location/tracking.ts` (which already fires
  every 30s/50m while tracking is on, regardless of which screen is open)
  now self-checks the schedule on every firing and calls
  `Location.stopLocationUpdatesAsync` the moment the window ends, with no
  app interaction required. **Honest limitation, not fixed and not fixable
  without real trade-offs:** auto-*start* still requires the app to be
  opened during the window — iOS throttles background fetch too heavily and
  Android is only ~15-min-granular at best, so a true zero-interaction
  auto-start wasn't worth the added complexity/battery-permission friction
  for what would still be an unreliable result. This is documented in a
  code comment on the new `syncTrackingToSchedule()` export in tracking.ts.
- **Fixed the "end hour stuck at 1" bug.** Root cause: the old field was a
  raw `TextInput` validated on every keystroke (0-23 range); clearing it to
  type a fresh number produced a transient empty string that failed
  validation, so the controlled input silently reverted to the last valid
  single digit and could never be cleared further. Replaced both Start/End
  hour `TextInput`s with a tap-to-open dropdown of 30-min increments (00:00
  through 23:30), eliminating the free-text edit entirely. Schedule storage
  moved from whole-hour ints to `startMin`/`endMin` (minutes since midnight)
  with back-compat loading for schedules saved under the old shape.
- **Added trip allocation on web** (`tradiee-app/app/(dashboard)/logbook/`):
  previously only the mobile app could allocate an unallocated GPS trip to
  work/personal/ignore + a job — the web logbook could only display/verify/
  export, and its own copy told admins to "use the mobile app" for this.
  Web logbook's GPS Trip Log tab now has the same allocate flow inline on
  each unallocated trip card, optimistic-updated then reconciled via
  `router.refresh()`.
- Verified with `npx tsc --noEmit` in both `tradiee-mobile` and `tradiee-app`.
- **Fresh APK built and confirmed** — see the "Latest APK" line at the top
  of this file (2026-07-11 07:55 NZT build, `BUILD SUCCESSFUL`). Carries
  this commit plus the previous round's mobile fixes.

**Job Map "Not on map" fix (Claude, 2026-07-11), commit `ec99cc5`, pushed:**
User reported Job Map showing "0 on map · 2 not located" for jobs with a
real site address. Every site-creation path (web `customer-form.tsx`,
mobile `customers/new.tsx`, `customers/[id].tsx`, `jobs/new.tsx`) already
geocodes the address once on save via `lib/geocode.ts` — but that function
silently returns `null` on a network error, rate limit, or unmatched
address, and there was no way to retry afterward short of re-editing the
whole site to trigger another save. Added a "Locate" button on unlocated
`job-map.tsx` cards that re-runs `geocodeAddress()` against the already-
stored address and writes `lat`/`lng` straight onto the `customer_sites`
row. **Rebuilt and confirmed** — see the "Latest APK" line at the top of
this file (2026-07-11 08:52 NZT).

**Sprint E (automations + growth reporting) shipped 2026-07-06.** New
`automation_events` table (migration `20260704090000_automation_events.sql`)
logs every automated send — `channel` (email/sms), `status`
(pending/sent/skipped_sms_dark/failed), `error`. `lib/notify.ts` is the
channel-aware helper: `notify()` fires every channel that has a recipient
(used for confirmations/reminders — belt-and-suspenders is fine there);
`notifyPreferred()` sends exactly one message, preferring SMS when Twilio's
live and the customer has a phone (used for review requests, so going live
with Twilio doesn't suddenly double-send). SMS always logs
`skipped_sms_dark` instead of vanishing when Twilio isn't configured — flips
to actually sending with zero code changes once it is. **Not manually
verified against live Twilio** — credentials are live in this env, so
SMS-path testing was deliberately skipped to avoid sending real texts to a
real number during dev; the code path is exercised (build+lint clean, dark
path exercised naturally since Twilio wasn't invoked with sms recipients in
testing) but not this specific fork of the notify() logic. Verify manually
before relying on it in production.

Automations wired in (all routed through `notify()`/`notifyPreferred()`,
all logged to `automation_events`):
- **Booking confirmed** (`lib/bookings/notify.ts sendBookingConfirmationEmail`) —
  called from `api/bookings/create` (no-deposit auto-confirm), the Stripe
  webhook (deposit paid), and the admin confirm action. Respects
  `booking_settings.confirmation_channel` (email/sms/both) for whether SMS is
  attempted at all.
- **Booking requested** (`sendBookingRequestedEmail`) — new acknowledgement
  email sent when a booking lands in `requested` (manual-approval packages);
  this didn't exist before Sprint E — visitors got silence until an admin
  manually confirmed.
- **24h booking reminder** — extended `api/reminders` (existing appointment-
  reminder cron section). Booking-sourced visits now get email too (was
  SMS-only before, and only SMS at that — a real pre-existing gap since email
  is the only channel actually live). Dedup via `automation_events`, not
  `job_visits.reminder_sent_at` (that column still belongs to the plain,
  non-booking visit loop, untouched).
- **Post-completion invoice** — new `api/reminders` section: when a
  booking's package has `creates_invoice=true` and its linked job's status is
  literally `'completed'` (scope note: checks the seeded default key, not each
  company's custom `job_statuses` — see code comment), creates a draft
  invoice at the package price and emails it, linking `bookings.invoice_id`.
- **Win-back** — new `api/reminders` section: completed jobs whose package
  has `recurring_interval_months` queue a re-book email (+ dark SMS) once
  that interval has elapsed since the visit's `actual_end`/`scheduled_end`.
  Link is `{appUrl}/site/{slug}/book/{packageId}` when the company has a
  website, else just `{appUrl}`.
- **Review request** — `lib/review-request.ts` refactored to route through
  `notifyPreferred()` instead of raw `sendEmail()` — same invoice-paid
  trigger as before (Stripe webhook + manual "Record payment"), now also
  tries SMS first when live, and links back to the originating booking (if
  any) via a `bookings.invoice_id` lookup for `automation_events`.

**Reporting**: `/reports` gained a **Growth** section (gated on
`hasAddon('bookings_website')`) — booking conversion rate, deposit revenue,
review requests sent, repeat-customer revenue, leads by source, bookings by
package, and an **Automation activity** card (sent / dark / failed counts +
the 5 most recent failures with their error text) satisfying "failed/skipped
sends visible to admin". **Not built**: avg inbound response time — nothing
in the schema records when a lead first got a reply, so there's no data to
report on; would need a new timestamp captured at first-response time, out of
scope for this sprint.

**Two real bugs caught and fixed during Sprint E build/testing** (both
pre-existing, found because Sprint E's post-completion invoicing exercised
draft-invoice creation for the first time in an automated context):
1. `companies.gst_rate` doesn't exist — the real column is
   `companies.default_gst_rate`. Both `app/api/reminders/route.ts` (new, this
   sprint) and the **pre-existing** `app/api/invoices/route.ts` (mobile
   "Complete and Invoice" flow) had this typo; both silently fell back to the
   0.15 default via `?? 0.15` instead of erroring, so a company with a custom
   GST rate got the wrong tax on every job→invoice conversion — a real,
   silent, live bug, now fixed in both places.
2. Companies with no custom `job_statuses` rows (i.e. **every company created
   after** migration 037's one-time backfill — new signups never get seeded)
   have zero terminal-status rows in the DB, so a naive `is_terminal=true`
   lookup finds nothing and every "is this job done" check silently fails for
   any new company. Fixed by falling back to `DEFAULT_JOB_STATUSES` from
   `lib/job-statuses.ts` (the same fallback every other reader in the app
   already uses) when a company has no custom rows — win-back would otherwise
   never fire for the majority of real companies.

**Sprint D (public booking widget + Stripe deposits) shipped 2026-07-04.**
Public widget at `app/site/[slug]/book/[packageId]/page.tsx` +
`booking-widget.tsx` (uses the package **id** in the URL, not a slug —
`bookable_packages.public_slug` exists in the schema but there's no admin UI
to set one yet, so id-in-URL is the pragmatic choice; revisit if pretty URLs
matter later). Flow: pick slot → `POST /api/bookings/hold` (wraps
`tryHoldSlot()`) → enter details → `POST /api/bookings/create` (matches
customer by normalized email then phone, conflicting matches flag the
booking for review, transitions status per package rules) → if
`requires_deposit`, `POST /api/bookings/deposit-intent` creates a Stripe
PaymentIntent and mounts Stripe Elements inline. `app/api/stripe/webhook/route.ts`
has a new `payment_intent.succeeded` branch (`handleBookingDepositPaid`) that
sets `deposit_paid`, flips status to `confirmed`, creates the job/visit, and
emails confirmation — guarded by `.eq('status', 'deposit_pending')` so a
Stripe retry is a no-op (verified by replaying the same event: no double
deposit, no duplicate job). Job/visit creation is shared via
`lib/bookings/fulfill.ts createJobFromBooking()` across three callers: the
create route (no-deposit auto-confirm), the webhook (deposit paid), and the
new admin confirm action. Booking confirmation email lives in
`lib/email.ts bookingConfirmationEmailHtml()` + `lib/bookings/notify.ts`.

Admin surface: `/bookings` gained a **Requests** tab (new default tab) listing
actual `bookings` rows with Confirm/No-show/Cancel actions
(`PATCH /api/bookings/[id]`) and a deposit **Refund** button
(`POST /api/bookings/refund`) enforcing the refund policy below — disabled
client-side and rejected server-side outside the window, with a tooltip
explaining why. Packages tab got a "Copy link" button (needs
`company_websites.slug` — falls back to nothing if the company has no
website row yet). **Bug caught during manual testing, fixed before commit**:
the confirm/cancel/no-show route wrote `status: action` directly, so
"cancel" (the action name) got written instead of "cancelled" (the enum
value) — violated `bookings_status_chk` silently because the Supabase error
wasn't checked. Fixed by mapping action → status explicitly and checking
`error` on every write in that route.

> **Deposit refund policy (decided 2026-07-04): full refund if the booking is
> cancelled more than 24 hours before `starts_at`; deposit is forfeited for a
> late cancellation or no-show.** Hardcoded 24h window constant in both
> `app/api/bookings/refund/route.ts` and the admin UI's button-disable check
> (per-company configurability wasn't asked for). Admin triggers the refund
> manually via a button that's only enabled outside the forfeit window — no
> auto-refund on cancellation, per the doc.

Manually verified end-to-end against cloud Supabase + live Stripe test mode
(not just `tsc`/`next build`): no-deposit auto-confirm path (slot hold →
customer+job+visit created correctly), deposit path (real PaymentIntent
created, `stripe_payment_intent_id` stored pre-payment, webhook signed and
replayed via `stripe.webhooks.generateTestHeaderString` — confirmed
idempotent), and the admin Requests tab end to end including the refund
policy rejection. Test data cleaned up after.

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
for local dev. Provider/admin health belongs in the admin console; end-user
Settings → Integrations only shows customer-relevant integrations.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `R2_ACCOUNT_ID`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_*`/`R2_PRIVATE_*` keys, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://cdn.industryforms.app`
- `NEXT_PUBLIC_APP_URL=https://app.industryforms.app`, `NEXT_PUBLIC_POWERSYNC_URL`, `CRON_SECRET`
- **LocationIQ** — `NEXT_PUBLIC_LOCATIONIQ_KEY` for geocoding (address autocomplete + job map pins). Falls back to Nominatim (rate-limited in prod) if unset.
- **Twilio (live)** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Point the number's "A MESSAGE COMES IN" webhook at `https://app.industryforms.app/api/sms/inbound` (POST).
- **Resend (set locally but broken — confirmed 2026-07-06)** — `RESEND_API_KEY` is present in
  `.env.local` but every real send during Sprint E testing returned `API key is invalid` from
  Resend itself (not a config-missing no-op — a real rejected key). **Every email in the app is
  silently failing** if the same key is live in Vercel. Check the Vercel value too; rotate the key
  in the Resend dashboard if it's stale/revoked. `EMAIL_FROM` (verified sender domain) still needed either way.
- **Stripe (live — confirmed 2026-07-04)** — `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET` are all live; Sprint D's testing created and refunded real test-mode
  PaymentIntents successfully. Webhook target: `/api/stripe/webhook`.
  Add-on billing now also requires Stripe lookup keys `projects_monthly`,
  `bookings_website_monthly`, and `sms_usage_metered`. `sms_usage_metered`
  must be a usage/metered price at **13c per SMS event** using meter event name
  `tradiee_sms_message` unless `STRIPE_SMS_METER_EVENT_NAME` is set.
- **OpenAI** — `OPENAI_API_KEY` is now required for the main AI value paths:
  supplier invoice parsing (`gpt-5.4-nano`, falling back to `gpt-5.4-mini`),
  AI quote drafting (`gpt-5.4-mini`), and optional daily to-do wording polish
  (`gpt-5.4-nano`). Optional overrides: `OPENAI_MODEL_NANO`,
  `OPENAI_MODEL_MINI`.
- **Anthropic (legacy/live)** — `ANTHROPIC_API_KEY` still powers remaining
  legacy AI helpers until migrated (SmartWrite/AI rewrite, AI assistant, and
  VoiceFill parse paths).
- **Xero (real value present, 2026-07-07)** — `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` now set in `.env.local`. Not yet mirrored in Vercel — do that before relying on Xero sync in prod.
- **MYOB / QuickBooks** — not production-wired yet because both need developer
  apps, OAuth redirect URLs, client IDs/secrets, scopes, and approval/production
  readiness before safe sync work. Build OAuth + sync only after those are
  available.
- **Google Business Profile** — `lib/gbp-sync.ts` remains a deliberate stub
  until Google grants Business Profile API access. You need Google Cloud project
  ownership, Business Profile API approval, OAuth consent/verification, and a
  verified business profile/location before this can be wired.
- **Google (real value present)** — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set. Google Calendar sync is fully implemented (see Features built) — the OAuth callback (`app/api/google/callback/route.ts`) had its `state`-param trust fixed during the 2026-07-07 security pass (see below).
- **Other placeholders** — `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID` (+optional `CLOUDFLARE_SAAS_FALLBACK_HOSTNAME`), `INBOUND_EMAIL_SECRET`.

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

### Growth Engine Sprint C (2026-07-04) — bookable packages + availability engine

Schema: `bookable_packages`, `booking_settings`, `booking_availability_rules`,
`booking_blackouts`, and (brought forward from Sprint D — the concurrency
guarantee can't be tested without it) `bookings` with only its hold-related
columns exercised. Concurrency guard is a **partial unique index** on
`(company_id, coalesce(assigned_to, sentinel), starts_at)` for live statuses
— the insert IS the mutex. **Caught before shipping**: Postgres unique
indexes treat `NULL <> NULL`, so the first version of that index silently
didn't protect "any staff" bookings (`assigned_to null`, the common case) at
all — fixed with the `coalesce` expression, verified by firing 5 truly
concurrent inserts at the same slot: exactly 1 succeeded, 4 got `23505`.

`lib/bookings/timezone.ts` — DST-safe wall-clock↔UTC conversion via
`Intl.DateTimeFormat` only, no new dependency. `lib/bookings/availability.ts`
generates slots from hours + blackouts + `job_visits` + live bookings,
respecting per-package buffers; resolves against one staff context at a time
(specific `profileId`, or company-wide when none given) — documented scope
reduction, not a correctness shortcut. `tryHoldSlot()` reaps an expired hold
on the exact slot inline on retry; the daily `/api/reminders` cron also cleans
up expired abandoned holds for Hobby-plan Vercel compatibility. Admin UI at `/bookings` (packages, weekly hours,
blackouts), gated on `bookings_website` like the rest of Sprint B.

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

Sprint E (automations + reporting) shipped 2026-07-06 — see the summary near
the top of this doc under "Where work lives right now".

### Security/compliance pass (2026-07-07)

Full gap-analysis + remediation against SOC2/ISO27001/GDPR/PCI-DSS-style
controls — not a certification, see `COMPLIANCE_GAP_ANALYSIS.md` for the full
record. Highlights:
- **Critical fix**: `POST /api/auth/invite` had **no authentication check** —
  `companyId` is exposed in the public booking widget's client JS, so any
  anonymous visitor could mint an admin account (with password returned in
  the response) inside any company with a public booking page. Now requires
  a session + owner/admin role in the matching company.
- Fixed 2 OAuth account-hijack bugs (`api/google/callback`, `api/xero/callback`)
  that trusted the client-supplied `state` param instead of deriving identity
  from the session.
- Fixed 5 cross-tenant authorization gaps found via a dedicated grep pass
  (`portal/send-link`, `xero/sync`, 2× email routes, 2× sms routes).
- Added Supabase-native MFA (TOTP) for super-admins (`/admin` now enforces
  AAL2), password complexity policy (8+ chars, upper/lower/number,
  `lib/password.ts`), PostgREST filter-injection fix in `api/search`,
  admin action audit logging (`lib/audit.ts`), RLS on `calendar_sync_log`,
  account-deletion completion flow, zod validation rolled out across ~25+
  API routes, `.env.example`.
- `privacy.md` corrected to say data is hosted in **Singapore**
  (`ap-southeast-1`), not Australia/NZ as it previously (incorrectly) claimed.
- Still open: `postcss` transitive vuln (needs a Next major bump),
  `admin_audit_log` doesn't cover every privileged action yet, no GDPR data
  export endpoint.

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
inbox). Integrations is now end-user focused (Google Calendar, Xero, import);
provider/admin health for Resend, Twilio, Stripe and Anthropic belongs in the
admin console, not customer Settings.

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
Source selection is deterministic; if `OPENAI_API_KEY` is present,
`gpt-5.4-nano` only polishes task title/description/priority.

**AI rewrite + AI-draft-quote** — `/api/ai/rewrite` (tone presets) +
`/api/ai/draft-quote` (price-list-grounded, server-side re-validated).
Draft quote uses `gpt-5.4-mini`; rewrite is still on the legacy Anthropic
path until migrated.
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
  **Timesheets** (+travel logs), Job costing, Materials (+OpenAI nano-first
  supplier-invoice parser "SmartRead" with mini fallback), **SmartWrite** +
  **VoiceFill**, Price list (+CSV
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

## Migrations (supabase/migrations/) — 001-046 applied to cloud; 20260707 local migrations pending deploy verification
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

Local 2026-07-07 migrations added by Codex and not yet verified/applied against
local Supabase or cloud: `20260707034000_calendar_sync_log_rls.sql`,
`20260707092713_seed_missing_job_statuses.sql`,
`20260707092843_profile_dashboard_widgets.sql`,
`20260707104353_prevent_duplicate_open_timesheets.sql`, and
`20260707112314_stripe_payment_idempotency.sql`. The last migration also adds
a service-only `portal_login_attempts` table/RPC and Stripe payment settlement
RPC; run migration list/apply plus data preflights before deploy.
Also pending verification/deploy: `20260708103000_kits_inventory_bundle_pricing.sql`
adds kit SKU/sell-price fields and the `consume_price_list_stock` RPC used by
job/invoice item and kit stock consumption.

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
1. **Resend — fix the key, don't just "set" it** (this list previously said
   Resend was unconfigured; confirmed 2026-07-06 that's wrong — a key is
   present but Resend itself rejects it as invalid). Get a working
   `RESEND_API_KEY` + verified `EMAIL_FROM` sender domain into Vercel, then
   redeploy. Every quote/invoice/reminder/review-request/booking email in the
   app is currently silently failing on this.
2. ~~Stripe~~ — **done, live since before 2026-07-04.** Still need to create
   the `website_monthly` ($9/mo) and `projects_monthly` ($19/mo) Stripe
   Prices if they don't already exist in the Stripe dashboard.
3. ~~Twilio inbound signature verification~~ — **done in Sprint A** (see
   `lib/sms.ts validateTwilioSignature()`, wired into `/api/sms/inbound`).
4. **Wildcard domain `*.industryforms.app`** in Vercel + DNS for free
   per-tenant website subdomains.
5. **Cloudflare for SaaS** — `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID`
   (+ optional `CLOUDFLARE_SAAS_FALLBACK_HOSTNAME`) for website custom domains.
6. **Stripe webhook handler for Projects add-on** — `/api/billing/addon`
   currently flips `companies.addons.projects.active` directly. Fine for
   dev/super-admin; needs a Stripe checkout + webhook for prod.

### Building next
**The Growth Engine roadmap (Sprints A–E) is fully shipped** — no explicit
next sprint scoped. Leading candidates:
- **Marketing site** (industryforms.app — separate from tenant Instant Websites). No work started — leave until explicitly asked.
- ~~Configurable dashboard widgets~~ — **done 2026-07-07 by Codex.**
  `/dashboard` now wraps the existing stats, to-do, recent jobs, overdue
  invoices, and profitability sections in a swappable widget controller
  (`components/dashboard/dashboard-widgets.tsx`). Users can hide/show widgets
  and move them up/down; preferences persist per user on
  `profiles.dashboard_widgets` (migration
  `20260707092843_profile_dashboard_widgets.sql`). Saved preferences include
  an audit payload identifying the feature as built by Codex. Reality-check
  fix: failed preference saves now surface an inline error instead of silently
  looking successful.
- ~~Job maps: geocode-on-save~~ — **done, fixed 2026-07-07.** The two inline
  add-site paths inside the New Job dialog (`app/(dashboard)/jobs/client.tsx`
  — `addSiteInline()` and the new-customer "Add as job site" flow) previously
  inserted `customer_sites` with no `lat`/`lng` at all; the dedicated add-site
  form (`components/forms/site-form.tsx`) was the only path that geocoded.
  Both now call `geocodeAddress()` before insert, same pattern as
  `site-form.tsx`. Verified live end-to-end (new customer → "Add as job site"
  → real address → `customer_sites` row confirmed with correct `lat`/`lng`
  via Nominatim; test data cleaned up after).
- ~~Per-company job_statuses backfill~~ — **done 2026-07-07 by Codex.**
  `app/api/auth/signup/route.ts` now seeds `DEFAULT_JOB_STATUSES` for every
  new company and rolls back the signup if profile/status creation fails.
  Migration `20260707092713_seed_missing_job_statuses.sql` backfills companies
  that were created after migration 037's one-time seed and now fills missing
  default keys for partial status sets too.
- **Twilio SMS path for Sprint E's notify()/notifyPreferred()** — code-complete
  and logs correctly to `automation_events`, but not manually verified against
  live Twilio (avoided sending real test texts). Twilio creds are live in
  `.env.local` — worth a real smoke test with a real phone number before
  relying on `confirmation_channel: 'sms'/'both'` or the review-request
  SMS-preferred path in production.
- ~~Reminder-cron delivery stamps + comms logging~~ — **done 2026-07-07 by
  Codex.** The plain visit-reminder loop in `app/api/reminders/route.ts` now
  sends through `notify()` so it logs `automation_events`, then writes a
  best-effort `communications` entry tied to the visit reminder only when SMS
  actually sends. Reality-check fixes: dark/failed/missing-phone paths no
  longer stamp `job_visits.reminder_sent_at` or create misleading communication
  rows; booking-sourced visit stamps now require an actual sent reminder; and
  invoice dunning only updates `last_reminder_at` after at least one channel
  sends successfully. Third-audit fix: service reminders now only roll forward
  or mark `sent` after email delivery succeeds.

### Future backlog (in priority order)
- ~~Tap to Pay finish~~ — **code-complete 2026-07-07 by Codex.** Installed
  `@stripe/stripe-terminal-react-native`, wrapped the mobile app in
  `StripeTerminalProvider`, wired authenticated Terminal connection-token and
  PaymentIntent helpers, replaced the `pay-now` placeholder with the real
  Tap-to-Pay discover/connect/collect/confirm flow, added Android native
  permissions/hooks/minSdk config, and set the Stripe Terminal location in
  `eas.json`. Reality-check fixes: Terminal API routes now validate mobile
  bearer users through the service client/profile lookup, and server-side
  PaymentIntent creation caps/derives the charge from invoice outstanding
  instead of trusting the mobile-supplied amount. Third-audit fix: Stripe
  invoice webhook settlement now writes `payments.stripe_payment_intent_id`
  through a transactional `record_stripe_invoice_payment` RPC plus a partial
  unique index, so replayed or concurrent `payment_intent.succeeded` events do
  not double-count payments. Audit markers were added in the Tap-to-Pay helper,
  payment flow, Stripe provider init, Android `MainApplication`, Gradle config,
  and payment idempotency migration. Verified with `npx tsc --noEmit`,
  scoped web ESLint, `npx next build`, and
  `android/gradlew.bat assembleDebug --no-daemon`.
  Still needs real-device smoke testing with a compatible NFC device, Stripe
  Terminal account/location readiness, and Apple's proximity-reader entitlement
  before iPhone production use.
- ~~Google Calendar sync~~ — **done, this line was stale.** Verified
  2026-07-07: `lib/google-calendar.ts` (token refresh) + `app/api/google/sync/route.ts`
  (real sync) are both implemented and wired in.
- ~~GPS geo-fence time clock~~ — **code-complete 2026-07-07 by Codex.**
  Extended the mobile background location task to detect stationary arrival
  within 150 m of a geocoded active job site assigned to the signed-in worker,
  then insert an open `timesheets` row, link a matching scheduled visit when
  present, update that visit to `in_progress`, and store the same active timer
  state used by manual job timers. `app/timesheets.tsx` now shows a dismissible
  auto-check-in notice with a jump to the job. Audit marker lives in
  `tradiee-mobile/lib/location/tracking.ts`. Reality-check fix: migration
  `20260707104353_prevent_duplicate_open_timesheets.sql` adds a partial unique
  index so a worker can have only one open timesheet, and mobile timer starts
  now reconcile any existing open server timer before inserting and after
  unique-index race conflicts. Verified with
  `npx tsc --noEmit` and `android/gradlew.bat assembleDebug --no-daemon`.
  Still needs a real device drive/arrival smoke test because simulator/desktop
  builds cannot validate background GPS timing, OS battery policy, or
  site-radius behavior.
- ~~Customer portal login~~ — **code-complete 2026-07-07 by Codex.**
  Added `/portal/login` and `POST /api/portal/login` as a customer magic-link
  login: a customer enters their email, the API sends fresh
  `customer_portal_tokens` links to matching customer records, and the response
  stays generic to avoid email enumeration. Expired portal links now point to
  the login page for self-service recovery. Staff-sent and customer-requested
  portal emails share `lib/customer-portal.ts`, which also HTML-escapes
  customer/company data. Reality-check fix: public login no longer deletes
  existing portal tokens and applies a per-customer cooldown before sending a
  fresh link. Third-audit fixes: the public portal job detail no longer exposes
  internal visit/job notes, staff-sent replacement links only revoke old tokens
  after successful email delivery, and public login now uses a service-only
  `portal_login_attempts` throttle table/RPC for atomic IP/email request
  limits. Audit
  markers live in `app/api/portal/login/route.ts`, `app/portal/[token]/jobs/[jobId]/page.tsx`,
  and the 20260707112314 migration. Verified with web `npx tsc --noEmit`,
  scoped ESLint, and `npx next build`.
- **Pricing levels** (per-customer-group pricing). **MYOB/QuickBooks** sync
  (have Xero). **Invoice templates** standalone (currently lean on recurring
  invoices). Confirmed not started, no matching schema/code found.
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
