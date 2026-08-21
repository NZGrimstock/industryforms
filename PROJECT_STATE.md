# IndustryForms — Project State (handoff)

Last updated: 2026-08-21. Catch-up doc for a fresh session. Read this first.
Start with **Current app/release state** below — it has the live facts (store,
signing, build process, database) that the dated session logs can contradict.

## Action items (needs a human — not code)

- **Staff-role users see silently-understated financial figures on
  `/customers/[id]` and `/jobs`** (found 2026-08-21, during an 8-angle
  reality-check pass over the 2026-08-20/21 session — pre-existing, not
  introduced by that session). Both pages run under the viewer's own
  RLS-scoped session (`createClient()`, not the service client). `invoices`
  has been owner/admin-only SELECT since `031_role_based_access.sql` —
  predating this by a long way — so any staff member who can reach these
  pages (no page-level role gate blocks them) gets an empty `invoices`
  result set, and every stat derived from it ("To invoice" on the customer
  page, the Jobs list "To Invoice"/"Invoiced in Full" split) is silently
  wrong for them, with no error and no indication anything was omitted.
  The 2026-08-20 variations feature added one more query with the same
  correctly-matching RLS shape, which is what surfaced this on review — but
  the underlying gap is older and broader than that one feature. Needs a
  scoped decision before touching it: either loosen `invoices`/`variations`
  SELECT to all company members (if seeing the numbers is fine, just not
  the line-item detail), or add an explicit role gate so staff get an
  honest "you don't have access to this" instead of a wrong number.

- **Confirm the 2026-08-20 mobile OTA push actually reached real devices, and
  check whether the Google Play Production track itself needs a fresh native
  build.** A live user report ("phone number isn't showing up when people
  try to sign up on mobile app") turned out, from a real screenshot, to be a
  build old enough to predate the phone field *and* the whole "Mobile app
  overhaul" commit entirely (different field order, no phone field, copy
  still says "Free 30-day trial" vs current "28-day"). The mechanism: that
  old client never collects phone, but the live signup API now requires it
  server-side (`if (!phone?.trim()) return 400`), so anyone on that build
  can fill out the whole form and get a signup failure with no field to fix
  it. `eas update --branch production --environment production` was
  published (Update group `c10a20ac-73ec-492f-8a79-b648dc2f5363`, commit
  `5501644`) to close a 2-week gap on the OTA channel — user confirmed the
  installed app **is** on the Production Play Store track. If OTA delivery
  is genuinely working for that install, it should now show the phone
  field; if the report persists after this, the device is very likely on a
  native binary whose OTA channel plumbing itself is broken (the exact
  failure mode documented below under "EAS Build injects the update
  channel; raw Gradle does NOT") or one that predates OTA config entirely —
  in which case only a fresh native build, submitted and promoted through
  Google Play's **Production** track (not just Internal testing, which is
  what `eas.json`'s submit config targets by default), fixes it. Needs a
  human to check the affected user's app again and, if still broken, cut
  and promote a new build.

- ~~`tradiee-app/.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at PRODUCTION~~
  **Fixed 2026-08-20.** Discovered the hard way: ran `npm run dev` to
  browser-test the takeoff page, signed up a throwaway test company through
  the real signup form to reach the dashboard, and only realized afterward
  that the dev server was never talking to local Postgres at all — it hit
  production (`quidcdrnzjwarrqdpyao.supabase.co`). The test company, its
  profile, and its Supabase Auth user were found and deleted from
  production immediately after (confirmed via read-only queries: 0 rows
  remaining for all three), so no lasting data trace — but the signup
  route's fire-and-forget `notifyAdminConsole()` call almost certainly still
  fired a real "new trial signup" ping to admin.industryforms.co.nz for
  `test-takeoff@example.com`, which can't be un-sent; **still worth a human
  glance at the admin console to dismiss it if it landed.**
  `.env.local` now points `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` at local
  Supabase (`http://127.0.0.1:54341`, values from `supabase status` —
  requires `supabase start`/Docker running), verified by starting the dev
  server fresh and confirming the local URL is what actually ships in the
  client JS bundle. The old production values are kept commented out in the
  same file for if you deliberately need to point dev at prod again. Every
  OTHER credential in `.env.local` (Stripe, R2, PowerSync, Xero, Twilio/
  WebSMS, Google, Anthropic/OpenAI) is still live/production — untouched,
  since only the Supabase fix was asked for; worth deciding separately
  whether any of those should also move to sandbox/test equivalents for
  local dev.

- **`job_diary_entries` needs a PowerSync Dashboard sync-rules upload
  (2026-08-20).** The migration, publication, and both client schemas are all
  live in production, but `sync-rules.yaml` itself has no CLI push path — per
  its own header comment, it's uploaded by hand via the PowerSync Dashboard →
  Sync Rules. Until someone does that, the new table sits in the Postgres
  publication but PowerSync never actually streams it, so the mobile site
  diary card will silently show nothing synced (writes still work — they go
  straight to Supabase — but the local read-back via `useQuery` won't see
  rows other devices wrote until this is done).

- **Mobile still double-counts GST on the job detail screen**
  (`tradiee-mobile/app/jobs/[id].tsx`, `displayedMaterialsTotal` ~line 916 and
  `materialPrice` ~line 1251) — found by the pt.4 reality-check pass, not
  fixed. The web-side fix (pt.2) used `lineNet()`; this mobile screen still
  does raw `quantity * unit_price`. Same bug class as the original report,
  just a different screen — will read as a new bug to a mobile user.
- **Mobile's background GPS vehicle tracker has no free-plan awareness**
  (`tradiee-mobile/lib/location/tracking.ts`, `app/timesheets.tsx`) — the new
  `block_travel_log_if_free_plan` trigger (pt.3) rejects every `travel_logs`
  insert for a free-plan company, but per the pt.4 reality-check pass,
  `stopTracking()` returns `false` (and skips calling
  `Location.stopLocationUpdatesAsync`) whenever the save fails, so once a
  free-plan phone hits this, the user reportedly cannot turn off background
  tracking through the app at all — needs a mobile-side plan check before
  this ships to real free-plan users on phones with tracking already on.
- **Free tier + referral program need live click-throughs** before trusting them
  with real customers: sign up a throwaway company, let its trial lapse (or set
  `trial_ends_at` in the past), confirm it lands on the free plan instead of a
  paywall; hit the 3-job/10-customer caps for real; confirm the logo upload is
  actually greyed out and the "Powered by" line actually appears on a real
  invoice PDF; check the new Jobs "To Invoice" tab count against real
  completed-but-unbilled jobs. For referrals: sign up a second throwaway
  company via a real `?ref=` link, pay a real (test-mode) invoice on it, and
  confirm the referrer's Stripe customer balance actually gets credited — the
  `invoice.paid` webhook case, the `parent.subscription_details` field path
  it depends on (confirmed against the installed `stripe` SDK's own type
  definitions, not guessed), and the `createBalanceTransaction` call are all
  unverified against a live Stripe event.
- **Re-run a holistic reality-check pass over the 2026-08-16 pt.3 session**
  (commits `f65cf6a`..`0b0e2eb`) — one was started covering the four
  earliest commits of that session (refund Connect scoping, the Settings
  tab move, the GST double-count fix, the mobile-auth bundle), which had
  only ever been checked with `tsc`/`eslint` + reasoning, never an
  adversarial pass. It was interrupted by a session/token limit before
  reporting findings. Every other commit in that session already got its
  own reality-check pass (see the pt.3 session entry below for what was
  found and fixed).
- **Set up Resend Inbound for the enquiry email inbox** (2026-08-16): the
  webhook handler (`app/api/inbound/email/route.ts`) was rewritten to verify
  Resend's Svix-signed `email.received` webhook and fetch the full body via
  `resend.emails.receiving.get()`, but nothing routes real mail to it yet —
  `inbound.industryforms.app` has no MX record, which is why a real email
  bounced "address not found" (reported 2026-08-16). Needs, in the Resend
  dashboard: (1) add the MX record for `inbound.industryforms.app` under
  Domains → Receiving, (2) create a webhook subscribed to `email.received`
  pointed at `https://app.industryforms.app/api/inbound/email`, (3) put its
  signing secret in `RESEND_WEBHOOK_SECRET` (Vercel + `.env.local`). Then
  send one real test email to a generated `co-xxxxx@inbound...` address and
  confirm it lands as an enquiry.
- **`20260816100000_credit_notes.sql`** — applied to production 2026-08-16
  (`supabase db push --linked`). Still owed: one real click-through — credit
  a real invoice both ways (Stripe refund, account credit), apply account
  credit to a draft invoice for the same customer, and sync a credit note +
  its allocation to Xero if connected. See `CREDIT_NOTES.md` for what's
  already verified vs not.
- **`20260815100000_lock_job_once_fully_invoiced.sql`** — applied to
  production 2026-08-16 (`supabase db push --linked`). Verified against real
  local Postgres (12-case pass, see 2026-08-15 session entry) and the app-level
  guards were extended 2026-08-16 to cover a quote-less job's own logged
  materials/labour too (previously only a quoted job's ceiling was enforced).
  Still owed: one real click-through — fully invoice a real (or throwaway)
  job, confirm materials/timesheets/notes are rejected with the new message,
  confirm a technician can still message on it, and confirm the Unlock button
  (owner/admin, both apps) actually restores editing.
- **SMS provider swapped Twilio → WebSMS 2026-08-11.** Vercel production env
  vars are now set (confirmed 2026-08-12) — sending live from WebSMS's shared
  **group-pool short code 34567** (their standard offer below 3000 msgs/month;
  WebSMS owns the carrier registration for that number, not us). Our own
  dedicated code **848484** is provisioned and ready — switching to it later
  is a one-value `WEBSMS_POOL_NZ` env change (Vercel + `.env.local`), no code
  change. Two things still needing a human:
  1. Register the webhook URL in the WebSMS members area
     (websms.co.nz/members/api-keys.php):
     `https://app.industryforms.app/api/sms/webhook?secret=<WEBSMS_WEBHOOK_SECRET value>`
     — must be the real prod domain, not the local `NEXT_PUBLIC_APP_URL`.
  2. **Send a real test text and check Vercel logs** for the
     `[sms/webhook] raw payload` line. WebSMS's inbound (MO) and delivery-
     report (DLR) JSON field names aren't fully documented publicly — the
     webhook (`app/api/sms/webhook/route.ts`) was built from their OpenAPI
     spec and query-endpoint response shapes, with fallback field names for
     the ambiguous ones (`messageId` vs `message_id`), but this needs a live
     message to confirm it's parsing the real shape correctly before trusting
     it for customer replies. See file header comment for exactly what's
     unconfirmed.
  3. **When volume nears 3000/month**, confirm with WebSMS whether moving to
     848484 needs its own business/sample-message verification submission
     (the sample invoice/quote messages + expected-reply examples prepared
     during the original short-code application are still accurate and
     ready to reuse if so).
- **Job messaging (2026-08-12) needs a migration push + a two-device test.**
  `supabase db push --linked` to apply `20260812100000_job_messaging.sql`
  (adds `job_notes.kind`; the trailing `update job_notes set id = id` is
  deliberate — it forces existing rows through the WAL so PowerSync devices
  actually receive the new column). Then send a message from the web
  dashboard and confirm it (a) arrives as a push on an assigned technician's
  phone, (b) opens the job when tapped, and (c) **does not appear on the job
  sheet PDF**. Push delivery is the one part that can't be verified without
  real devices.
- **Promote v7 from Internal testing → Production** in Play Console. A
  versionCode can only be uploaded once app-wide, so this is *Promote release*,
  not a re-upload.
- **Back up `tradiee-mobile/@grimstock__industryforms.jks`** (+ its password,
  currently only in `.migration.env`/EAS). Losing the upload key again means
  another Play key-reset round trip.
- **Delete the Singapore Supabase project** once fully satisfied with Sydney,
  and delete `.migration-work/` locally (it contains auth password hashes).
- **Lawyer review of ToS Section 4** (payment/merchant terms) for the NZ/AU
  unfair-contract-terms regime — live but unreviewed.
- **Settle the Stripe Connect loss-liability config** (see 2026-07-23 entry);
  bigger lever than any ToS wording.
- Confirm `STRIPE_WEBHOOK_SECRET_CONNECT` (+ optional `PLATFORM_ALERT_EMAIL`)
  are set in Vercel, or connected-account disputes never arrive.
- **Mobile app has no MFA challenge screen** (2026-08-05 mobile audit,
  `COMPLIANCE_GAP_ANALYSIS.md` pass 3). The web app enforces TOTP `aal2` on
  `/admin`; `signInWithPassword` on mobile returns an aal1 session and the app
  just proceeds. No super-admin surface exists on mobile to bypass, but a user
  who enrolled TOTP expecting it to protect their account has a password-only
  door to the same company data via the phone. This is a real feature to
  design/build, not a patch — needs a decision on scope (challenge screen UX,
  which roles it applies to) before it's code.
- **Decide on SQLCipher for the mobile PowerSync replica** (same audit pass).
  The local `tradelogix.db` is unencrypted; sign-out now wipes it and
  `allowBackup:false` stops it leaving the device via backup, but the file
  itself is still plaintext on disk while a session is active. Turning on
  SQLCipher needs a key-management decision plus a migration path for
  existing installs — not attempted.
- **Confirm `EXPO_PUBLIC_LOCATIONIQ_KEY` / `NEXT_PUBLIC_LOCATIONIQ_KEY` are
  domain/app-restricted** in the LocationIQ dashboard — both web and mobile
  ship the same key in their public bundles by design (it's a client-side
  autocomplete key), so restriction at the provider is the only thing
  standing between it and quota-theft.
- **Test the 2026-08-05 financial-visibility + batch-action features live.**
  No local Supabase was running that session, so the customer/job financial
  stat boxes and the batch invoice/complete dropdowns (jobs list, invoices
  list) were only verified via `tsc`/`eslint` and, as of pt.4, a real runnable
  check (`node tradiee-app/scripts/check-job-financials.mjs`) — never
  exercised against real seeded data in a browser. The check proves the math
  is internally consistent (and already caught a genuine DST off-by-one-hour
  bug), not that it's correct against real rows. Do a real pass before
  relying on them, especially the "to invoice" math and the batch-print
  popup-blocker behaviour.

## Open follow-ups (carry-forward — nothing blocking)

Optional next steps flagged during recent sessions; none are in-progress:
- **Mobile screens still PowerSync-only**: the invoice *detail* screen falls
  back to Supabase when a row hasn't synced; nothing else does. Deliberate — the
  real fix was the publication bug, not more fallbacks. Revisit only if sync
  proves flaky again.
- **`.easignore` doesn't trim enough**: EAS uploads a ~704 MB archive (~12 min).
  Only matters if you go back to cloud builds; local Gradle builds are unaffected.
- **Local-pack GEO**: `companies` has no lat/lng, so website JSON-LD includes
  address + areaServed but not precise `geo` coordinates. Adding a geocoded
  lat/lng field (on address save) is the upgrade for max local-pack strength.
- **Per-section layout variants** (e.g. image-left vs image-right hero): the 3
  styles share the same fixed section building blocks; layout variants would be
  a larger builder feature, not a reskin.
- **Job-map WebView loads Leaflet from unpkg + OSM tiles** (2026-08-05 mobile
  audit) — third-party script executing in-app, same class of issue already
  fixed on the marketing site by self-hosting fonts/icons. Vendoring Leaflet
  into the app bundle is the fix; not attempted, low priority (no known
  exploit, just supply-chain hygiene).
- **Batch invoice "To invoice" reads $0 for time-and-materials jobs with no
  quote** (2026-08-05, `lib/job-financials.ts`) — deliberate, not a bug: a job
  with no quote has no independent billable ceiling to compare against
  without replicating the GST/discount math invoices already do, and a wrong
  number is worse than an honest $0. Revisit only if this actually confuses
  users in practice.
- **Batch "Complete/Invoice and Print" opens one PDF tab per document,
  sequentially** — most browsers block pop-ups past the first per user
  gesture, so batching more than ~1 invoice's worth of prints needs the user
  to allow pop-ups. A combined multi-invoice PDF would fix this properly but
  `/api/invoices/[id]/pdf` doesn't support it today; not built.
- **Help Guide screenshots**: phone **Inbox** and **My Profile** still use the
  dashed placeholder (no clean screenshot existed). Drop
  `phone-inbox.webp`/`phone-profile.webp` into `public/help/` and add their ids
  to `HELP_SCREENSHOTS` in `components/help/help-content.ts`.
- **Embeddable booking iframe**: works with `postMessage` auto-resize; no known
  issues. `next.config.ts` scopes `frame-ancestors *` to `/site/*/book/*` only.
- **Stripe items only the account owner can do** (can't be done from code):
  confirm the "Your account" webhook destination includes `customer.subscription.*`
  events; verify Terminal/Tap-to-Pay enabled for the platform; get the first
  merchant through payouts onboarding (0 connected accounts exist as of the
  2026-07-18 audit) so Tap-to-Pay stops hard-409ing.

## Current app/release state (as at 2026-08-05)

- **Android is LIVE on Google Play** (`com.industryforms`). Upload key was reset
  (old key lost); Play's registered upload cert is now SHA1
  `62:C5:84:16:A5:26:8D:58:3F:88:CE:76:7F:3C:A6:23:4D:91:B4:FC`, which is the
  keystore EAS already holds — so EAS/local builds sign correctly with no extra
  setup. Keystore also downloaded to `tradiee-mobile/@grimstock__industryforms.jks`
  (gitignored) — **back this up**, losing it again means another key reset.
- **Builds are done LOCALLY with Gradle** (`cd android && ./gradlew.bat
  bundleRelease` for AAB, `assembleRelease` for APK), signed via
  `android/keystore.properties` (gitignored). versionCode lives in
  `android/app/build.gradle` and must be bumped manually — EAS's remote
  auto-increment does not apply to local builds. **v7 is uploaded to Internal
  testing.** A versionCode can only be uploaded once app-wide, so moving it to
  production is **Promote release**, not a re-upload.
- **⚠ EAS Build injects the update channel; raw Gradle does NOT.** The first
  local build shipped with `EXPO_UPDATE_URL` but no channel, so it could never
  receive an OTA — both updates published against it were silently unreachable.
  Fixed by declaring `updates.requestHeaders.expo-channel-name = "production"`
  in `app.json` (survives prebuild) plus the matching
  `expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` meta-data in
  `AndroidManifest.xml`. **Verify the channel is in the manifest on every local
  build** (`bundletool dump manifest`), not just signing/package/versionCode.
- **Verifying JS inside a build**: the bundle is Hermes bytecode, and Hermes
  stores any string containing a non-ASCII char (e.g. `…`) as **UTF-16**. Search
  both `utf-8` and `utf-16-le` or you'll get false "missing" results.
- **Database is Sydney** (`quidcdrnzjwarrqdpyao`, ap-southeast-2). Singapore
  (`cfltbpwrojtlpkjvresd`) was still alive as a rollback at time of writing —
  delete once fully satisfied. Local creds for both are in `.migration.env`
  (gitignored); note new Supabase projects reject IPv4 on the `db.<ref>` direct
  host, so use the **pooler** host.
- **PowerSync sync rules: `sync-rules.yaml` is the only correct file.** A stale,
  non-role-aware `powersync-sync-rules.yaml` was deleted 2026-08-05 — it scoped
  every query to company-only with no role check, which would hand every staff
  device the whole company's pay rates and invoices. If any doc/note/dashboard
  still references the old filename, it's wrong; `sync-rules.yaml` is edition 3
  (streams), role-aware, mirrors migration 031. The `powersync` Postgres
  publication's table list is now also captured in a tracked migration
  (`20260805130000_powersync_publication_full_table_list.sql`), not just the
  standalone `supabase/powersync-publication.sql` script — so a fresh
  environment via `supabase db push` now gets the correct publication without
  anyone remembering to also run that script by hand. Run
  `node scripts/check-sync-rules.mjs` after editing `sync-rules.yaml` — it
  asserts every query is user-scoped, role-gated where required, and that
  every referenced table is actually in the publication.

## Session 2026-08-21 (Claude) — Mobile native build, Tap to Pay HIG fix, reality-check on the 08-20 diff

Continuation of the 2026-08-20 session (crossed midnight). Four pieces:

**Fresh Android native build, versionCode 9, OTA channel verified in the actual artifact.** The `.env.local`-pointed-at-production incident (previous session) turned out to have a second consequence: a live user couldn't sign up on mobile — the installed app was old enough to predate the phone-number field entirely (screenshot showed "Free 30-day trial" copy vs current "28-day", different field order, no phone field at all), meaning the client never collects phone but the live signup API now requires it server-side, so signup silently 400s with no field to fix it. An OTA push closed a 2-week gap on the production channel but couldn't help — the installed build predates OTA config or has the documented broken-channel issue. Tried promoting the existing "v7" (Internal testing, already had the phone field + channel fix) straight to Production via the Google Play API — blocked, `androidpublisher.googleapis.com` has never been enabled on this Google Cloud project. User tried the manual Play Console promotion instead — rejected ("doesn't allow existing users to upgrade... does not add or remove any app bundles"), revealing something not previously known: an EAS-cloud-built **versionCode 8** (mid-July, from a commit no longer reachable in this repo's history — squashed at some point) is very likely what's actually live on Production, not the local-Gradle v7. Cut a fresh local Gradle build at **versionCode 9** to beat it. The gitignored `android/` folder (no git safety net — confirmed via `git check-ignore`) was backed up before running `expo prebuild` to sync `app.json`; keystore/signing config survived intact (verified by diff against the backup). **Critically, verified the OTA channel header in the actual built AAB, not just the source config** — decoded the real manifest with `bundletool dump manifest` (downloaded fresh, none was installed) and confirmed `expo-channel-name: production` is genuinely baked in, plus the runtime version matches what's live on the OTA channel. This is the exact verification step a past incident skipped. AAB uploaded by the user to Play Console; outcome not yet confirmed live.

**Apple Tap to Pay entitlement review response.** Apple's reply required two things: the final checkout button read exactly "Tap to Pay on iPhone" (was "Collect Payment") per their HIG, and a fresh recording showing the ToS-acceptance prompt after the "awareness moment" screen (already correctly ordered in code — `tap-to-pay-help.tsx` before `pay-now.tsx` on first use, per `TAP_TO_PAY_EDUCATION_KEY`). Fixed the button copy, then built and shipped a fresh iOS **preview** (ad-hoc, no TestFlight/App Store review) build via EAS cloud — local builds aren't possible for iOS on this Windows machine. First upload attempt failed with a transient `ECONNRESET` at 383/462MB; retry succeeded (7m44s upload, credentials already valid — device already provisioned, cert good until 2027). Delivered as an installable link for the user to record from.

**Reality-check pass over the entire 2026-08-20 session diff** (`5ae38db..HEAD` at the time, ~2900 lines across 44 files — variations, cost categories, site diary, assembly kits, job plans/takeoff persistence, the earlier per-item markup feature). 8 finder angles + a separate security pass, all via background agents, findings verified directly against the code before reporting. Found and fixed six real bugs, all committed together:
- **Self-inflicted regression, caught within the same session**: the Tap to Pay button-copy fix above was applied unconditionally, so it also showed "Tap to Pay on iPhone" on Android — which this same screen explicitly supports via a `Platform.OS === 'android'` branch a few lines up. Two independent finder angles caught this independently. Now iOS-only.
- **Mobile markup data loss**: editing a job material line (even just the quantity) silently nulled its `markup_pct` whenever the editor wasn't owner/admin — the markup input only renders for privileged users, so a value carried forward in state via `editMaterial()` was always trustworthy and shouldn't have been re-gated at save time.
- **`job_plan_measurements` missing an UPDATE RLS policy** — had select/insert/delete but no update, unlike every sibling table added the same day. Nothing calls `.update()` yet, but it would have silently no-op'd (Postgres RLS filters rather than errors) the moment something did. New migration adds it; verified against real Postgres for both an assigned and an unrelated staff member (correctly allowed/blocked respectively).
- **Drift risk**: `variations.tsx` recomputed the "approved" ceiling inline instead of importing `approvedVariationTotal()` — the exact helper the 08-20 session added specifically to stop this class of drift, which had already happened once (SQL trigger vs. TS guard, fixed in the same migration).
- **Missing upload validation**: `plans.tsx`'s plan-image upload had no file-size/type check, unlike every other upload surface in the app.
- **Needless latency**: the variations-approval route awaited a best-effort `todos` insert its own comment called non-critical. Moved to `after()` (not a bare fire-and-forget) — this repo already has one prior incident (`5ae38db`) from exactly that shortcut, since Vercel freezes the function the instant the response ships.

Two more findings turned out to be **pre-existing, not introduced by the 08-20 diff** — see Action items above (staff-role users see understated financial figures on the customer/jobs pages, because `invoices` has been owner/admin-only RLS since well before this session; the new `variations` query just added one more correctly-matching symptom of the same older gap). Security pass: zero findings at high confidence.

`tsc` clean on both apps after every fix. Migration pushed to production (`supabase db push --linked`). A fresh mobile OTA update was queued to ship the two mobile-side fixes.

## Session 2026-08-20 (Claude) — Buildxact gap analysis, six features shipped, a production data incident

Started from a competitive teardown of Buildxact's NZ feature pages (an
artifact, not saved to this repo), producing a 34-item gap schedule across
8 domains with a recommended build order. User picked "build variations"
then "continue through all stages" — six features shipped this session, in
the sequence the gap schedule recommended, each migrated/verified/committed/
pushed individually. See Action items above for two things still owed: the
PowerSync Dashboard upload for the site diary table, and — more
importantly — the `.env.local` pointing at production that this session
discovered mid-build.

**1. Variations (change orders).** New `variations`/`variation_items`
tables — itemised extra work, approved either by the customer signing at
`/v/<token>` (mirrors quote acceptance) or an owner/admin marking it
approved on site. The actual payoff: an approved variation raises the job's
invoiceable ceiling, so a job locked as fully-invoiced
(`20260815100000_lock_job_once_fully_invoiced.sql`) reopens itself once a
variation is approved — previously the *only* way out of that lock was the
admin override, meaning approved extra work had nowhere legitimate to go.
Found and fixed a real bug while wiring this up: `job_is_locked()` summed
invoice **subtotal** (ex-GST) against the quote's **inclusive** total, so
the database needed ~15% more billed than the app (`invoiceGuard()`) before
agreeing a job was locked — fixed on both the SQL trigger and the mobile
lock-status route that mirrors it. Web only; mobile is a deliberate
follow-on, matching the credit-notes precedent (owner/admin-only money,
staff devices never sync quotes/invoices).

**2. Cost categories.** New per-company `cost_categories` list (mirrors
`job_statuses`: Settings CRUD, members-select/admins-write RLS), seeded
with 7 trade-agnostic defaults at signup. Optional per `job_materials` line;
the Job costing card shows a by-category breakdown once at least one line
is categorised. Scoped to `job_materials` only — quote/invoice/PO line
items are a deliberate follow-up, not wired yet.

**3. Site diary.** New `job_diary_entries` — one row per job per day
(upserted on `(job_id, entry_date)`, so logging again today edits today's
entry rather than duplicating), with notes/crew-on-site/weather/delays.
The one feature this session that's genuinely synced via PowerSync
(sync-rules.yaml + publication + both client schemas) rather than
web-only — unlike variations/cost-categories, this is a field feature
crews log on site, often offline. Mobile gets the real add/edit UI; web
gets a read-only recent-entries card. Weather is free-text the crew types
themselves, not an auto-fetch from the site's lat/lng — no weather API is
wired into this codebase, flagged as a real follow-up rather than
half-built.

**4. Assembly kits.** `kits.is_assembly`/`assembly_unit` +
`kit_items.waste_pct` — opt-in per kit. When on, `kit_items.quantity` means
"needed per 1 unit" (e.g. per m²) instead of "per 1 kit", and using the kit
on a job (both apps) asks for the driving measurement instead of "how many
kits". Purely additive — every existing kit's `is_assembly` defaults false
and behaves byte-for-byte as before (driving qty 1, waste 0%, confirmed by
construction, not just by testing). Deliberately doesn't touch the quote
builder (`components/forms/quote-builder.tsx`, 861 lines, the single
highest-traffic revenue-critical component in the app) — quote-time
assemblies is a real follow-up, scoped out twice this session for the same
risk reason (see cost categories above too).

**5. Supplier price alerts + import attribution.** Quotes list flags a
sent-but-unaccepted quote with "Cost up" when a line's price-list item now
costs more than what was locked in as `unit_cost` at quote time — pure
comparison, no new schema. Price-list CSV import can now tag every
inserted/updated row with a supplier (reuses the existing `supplier_id`
column); re-importing *without* picking one never blanks an item's
existing attribution. Explicitly not a scheduled/recurring importer — that
needs a real per-supplier feed or partnership this app doesn't have.

**6. Takeoff tool.** New `/takeoff` — upload a plan photo, calibrate scale
by clicking two points a known distance apart, then measure length/area
(shoelace formula)/count. Entirely client-side: the image never leaves the
browser, nothing persists, no schema, no new attack surface. User was asked
directly before this one — takeoff is a different order of magnitude from
the other five (no existing infrastructure to extend) — and picked the
scoped-MVP option over a full persisted/PDF.js/quote-bound build. Verified
in two ways: `scripts/check-takeoff.mjs` for the pure geometry, and a real
end-to-end click-test in a live browser (upload → calibrate against a
synthetic 4m-wide test image → measure a rectangle → exactly 12.00 m² →
count three clicks → exactly 3 → remove → zero console errors throughout).

**Same-session follow-up: takeoff moved onto the job page, plans persist.**
Immediately after shipping the MVP above, asked to attach plans to jobs and
move the tool "under projects." Clarified with the user which entry point
they actually wanted (job-page card vs project-page vs standalone-with-a-
job-picker) rather than guess given three genuinely different data models —
picked "a card on the job page," matching Materials/Variations/Site diary.
The standalone `/takeoff` page and its sidebar entry are gone; new
`job_plans`/`job_plan_measurements` tables persist the image (uploaded to
the existing R2 public bucket via a new `job-plan` upload kind), calibration,
and every measurement's points (not just its computed value, so a reopened
plan redraws the overlay). A job can hold several plans, each independently
reopenable and addable-to. Web only, matching the tool's existing scope —
mobile takeoff is a real follow-up. Verified against real Postgres: RLS
(assignee-scoped read, company-scoped write, matching site diary's own
precedent), cascade delete, and the exact insert sequence the client
produces (new-plan save, reopen-and-add-another-measurement with sort_order
continuing correctly, deleting one saved measurement).

**The production data incident** (see Action items above for the full
account and what's still owed): browser-testing the takeoff tool meant
running `npm run dev`, which turned out to be pointed at production
Supabase via `.env.local`, not local. A throwaway signup created a real
row in production, caught immediately after and deleted (company, profile,
auth user — confirmed 0 rows remaining), but the signup route's
fire-and-forget admin-console notify almost certainly fired for real and
can't be unsent. Every database-level verification this session (all six
features' migrations, RLS, math) ran correctly against local Postgres via
`docker exec psql` — only the one browser click-test session hit
production, because the dev server's own env pointed there.

Every migration this session applied to **production**, not just local:
`20260820100000_variations.sql`, `20260820110000_cost_categories.sql`,
`20260820120000_job_diary.sql`, `20260820130000_kit_assemblies.sql`, plus a
fix to the previous session's `20260818100000_job_material_markup.sql`
(its WAL-backfill `update job_materials set id = id` hard-failed against a
real production job that was already fully-invoiced-locked — the exact
lock trigger class of bug, caught by `supabase db push --linked` itself
refusing to apply, not by local dev, which had no locked jobs yet to trip
it on).

## Session 2026-08-17 (Claude) — /terms → /login redirect loop: root cause was proxy.ts, not caching

A real user report (screenshot of a signup-flow chat) surfaced a live bug:
tapping "Terms of Service" or "Privacy Policy" from the mobile app's signup
checkbox sent the user to `app.industryforms.app/login` in a loop instead of
the actual page.

**Two wrong theories before the real one — recorded so the next session
doesn't repeat them.** First guess was Vercel edge-cache corruption scoped
to the custom domain: plausible from `curl` alone (307, survived
cache-busting query strings), but falsified by forcing a redeploy that
reproduced the bug on a completely fresh build (`routes-manifest.json` /
`prerender-manifest.json` pulled and inspected locally — clean, no
collision). Second guess was a Next.js 16/Turbopack static-rendering quirk:
client-component pages (`/login`, `/signup`) worked, every server-component
page outside `(dashboard)` didn't, so `export const dynamic =
'force-dynamic'` was added to the five affected pages — fixed nothing,
because comparing `x-vercel-id` hop counts between `app.industryforms.app`
(edge-only, no `::iad1::` hop) and its `industryforms.vercel.app` alias
(reaches the origin function) proved the request was being answered
*before* Next.js ever ran. Both wasted a redeploy each.

**Real root cause**: `tradiee-app/proxy.ts` — Next.js 16 renamed
`middleware.ts` to `proxy.ts` (`AGENTS.md` already warned file structure
would differ from training data; missed on the first two passes because the
search was for the old filename). Its `publicPaths` allowlist never
included `/terms`, `/privacy`, `/account-deletion`, `/invite/`, or
`/portal/` — every signed-out visitor hitting any of them got redirected to
`/login` before the request reached the page. Not just the legal pages:
this also hit the customer-portal and job-invite links the app emails out,
and (caught as a side effect, never independently reported) `/portal/login`
itself. `industryforms.vercel.app` never showed the bug because that
hostname falls into `proxy.ts`'s "unknown custom domain" branch and skips
the auth gate entirely — the alias had been accidentally masking the bug
the whole time, which is exactly what sent the first two theories down the
wrong path.

Fixed by adding the five paths to `publicPaths`
(`tradiee-app/proxy.ts:159`); the `force-dynamic` exports from the wrong
second theory were reverted in the same commit (harmless but pointless —
confirmed the five touched page files are byte-identical to before this
session). Security-audited the fix afterward: `/invite/` and `/portal/`
are still individually token-gated by their own per-page DB lookup — the
proxy check was blocking legitimate access, not protecting data — and no
authenticated dashboard route shares any of the five newly-public prefixes.
Verified live in production, not just typechecked: all 5 routes now 200,
`/dashboard` and `/upgrade` still correctly redirect when signed out.

**Lesson recorded for next time**: `git log --all` for `middleware.ts` will
find nothing in this repo on any commit — the file is `proxy.ts`. Start
there for anything routing/auth-adjacent on this codebase.

## Session 2026-08-17 (Claude, pt.4) — Reality-check fixes, Jobs "To Invoice" tab, marketing site

Follow-up to pt.2/pt.3, three pieces: fixing findings from an adversarial
review of the free-tier/referral commit, a genuinely new Jobs-list feature,
and marketing-site copy.

**Reality-check pass** (`/code-review HEAD high`, 8 finder angles, 11
findings) surfaced real bugs in work this session had just shipped and
called "verified" — worth internalizing, not just fixing: schema-level
Postgres checks proved the *mechanism* worked, but didn't catch a UI-layer
RLS gap or a hardcoded assumption about data that isn't actually fixed
(custom job statuses). Fixed 5 of the 11 (rest deferred to Action items,
mobile-side):
- **Referral friend names always showed the fallback placeholder** — the
  Settings → Referrals query joined `companies!referred_company_id(name)`
  through the RLS-bound client, but `companies` RLS only permits reading
  your *own* row, so the joined name was silently null on every request.
  Fixed by using the service client for that one query (safe — the
  `.eq('company_id', ...)` filter already scopes results to the caller's own
  earned credits; the service client only lets the *display name* of a
  referred company through too).
- **Free-plan job cap could permanently lock out a company that customized
  its job statuses** — `enforce_plan_row_cap()` hardcoded
  `status not in ('completed','cancelled')`, but `job_statuses` is
  per-company editable (Settings → Workflow lets an owner rename or delete
  the seeded rows). Fixed to join `job_statuses.is_terminal` instead — and
  that fix's own verification caught a *second* bug: a company with zero
  `job_statuses` rows (shouldn't happen for a real company, signup always
  seeds it, but the raw SQL test harness didn't) had every job count as
  active forever, including finished ones, which is worse than the original
  bug. Final version falls back to the literal keys only when no
  `job_statuses` row exists at all for that status — belt and braces, not
  either/or. Also added a `select ... for update` row lock, closing a TOCTOU
  race where two near-simultaneous inserts (web + mobile sync) could both
  read an under-cap count and both pass.
- **Referral credit sized off the raw `subscription_plan` column** instead
  of `effectivePlanKey()` — a referrer mid-Stripe-dunning (`past_due`, not
  yet `canceled`, so the column hasn't reset) would still get a real balance
  credit priced off their stale plan. One-line fix, same pattern as every
  other place this session already got this right.
- **The pre-existing `/api/billing/change-plan` stub silently started
  accepting `plan:'free'`** the moment `PlanKey` was widened to include it —
  that route has no Stripe call at all (a known placeholder, but genuinely
  called in production by the Team tab's seat-cap upgrade flow), so this
  would have let anyone downgrade a company to free with zero Stripe
  interaction, directly contradicting the free plan's own "never written to
  subscription_plan" design. Added an explicit guard rejecting it.
- **Settings → Subscription and `/upgrade` still showed lapsed-trial
  paywall copy** to companies now on the permanent free floor — both read
  the raw `subscription_plan` column (`'trial'` forever once lapsed)
  instead of `effectivePlanKey()`, so a free-plan company saw "Trial
  expired — choose a plan to continue" even though access was never actually
  ending. Both now show honest "you're on the Free plan, free forever"
  copy, and `/upgrade`'s header no longer alarms a still-fully-entitled
  trial user who clicked an upgrade link out of curiosity.

**Deferred, not fixed this session** (see Action items): mobile still
double-counts GST on the job detail screen (a *different* screen than the
one already fixed in pt.2 — the "checked mobile, nothing to fix" claim in
that session's own notes was wrong, caught by the reality-check pass
searching for the general pattern instead of web-specific variable names);
mobile's background GPS tracker has no free-plan awareness, so a phone that
already has tracking on when a company drops to free can reportedly never
turn tracking off again through the app once the new DB trigger starts
rejecting its writes.

**Jobs list: "To Invoice" tab + "Completed" → "Invoiced in Full".** Asked
3 clarifying questions before building (zero-value completed jobs, whether
Cancelled stays separate, whether this applies to any custom terminal
status or just the literal "completed" key) since each had a genuinely
different-code answer. Built per the answers: a completed job with zero
invoices ever sent lands in "To Invoice" regardless of dollar amount owed
(new `jobInvoicingBucket()`, `lib/job-financials.ts`); "Cancelled" keeps its
own unchanged pill; the split applies to *any* terminal status a company has
(not just the literal `completed` key), reusing the same `is_terminal`
semantics as the row-cap fix above. New `actualsJobCeiling()` shares the
GST-aware time-and-materials ceiling logic with the pt.2 actuals fix instead
of a third copy-paste of it — the existing two call sites (job detail,
customer detail) weren't refactored to use it, left as their original
duplicated implementations to control blast radius. New
`scripts/check-job-invoicing-bucket.mjs`. Needed `allowImportingTsExtensions`
added to `tsconfig.json` since `lib/job-financials.ts` now has its first
cross-file import — importing it extensionless had silently broken the
*pre-existing* `check-job-financials.mjs`, caught only because the full
check suite was re-run before committing rather than just the new script.

**Marketing site** (`index.html`): "Free plan available" added to the hero
tagline and pricing section trust line, plus a `$0` offer in the pricing
JSON-LD. "Intro price, locked in for 2026" and the crossed-out founding
prices removed from the web app's own pricing displays (Settings →
Subscription, `/upgrade`) now that Free is a real permanent tier alongside
them — the marketing site's own "Founding 25" crossed-out pricing was left
as-is (not asked for, and reworking that page's whole positioning wasn't in
scope).

Full local Postgres reset + re-verification after every fix (not just the
first pass) — job cap under both default and company-customized terminal
statuses, `travel_logs`/auto-todo gates, referral idempotency and RLS
lockout all reconfirmed. `tsc` and `eslint` clean; the 37 pre-existing
`eslint` errors elsewhere in the repo reconfirmed via `git diff` to belong
to files this session never touched.

## Session 2026-08-17 (Claude, pt.3) — Free tier locked down to basic CRUD only

Follow-up to pt.2's free tier: banner made permanent (no dismiss) and reworded
to "**Free Version** — {benefit}", and the free plan restricted to genuinely
basic customer/quote/job/invoice CRUD — no AI, no GPS tracking, no CSV
export, no auto purchase orders, no Xero, no auto-generated to-dos.

**Two AI routes had no auth check at all** (`/api/voice/parse`,
`/api/supplier-invoice/parse`) — found while auditing every AI surface to
gate by plan, fixed in the same commit (`resolveCompanyUser()` added,
closing both the auth hole and the plan hole together). All AI routes
(`ai/draft-quote`, `ai/rewrite`, `ai-assist`, the two above) now 403 for
free-plan companies.

Vehicle logbook (GPS-tracked trips + its CSV export, the only export feature
in the app — everything else matching "export" is actually import, correctly
left alone) is one page, gated at the page level (redirect to `/upgrade`) —
plus a new DB trigger (`20260817120000_free_plan_feature_gates.sql`) blocking
`travel_logs` inserts for free-plan companies directly, since mobile's
background GPS tracker writes straight to Supabase with no page to gate.
Same migration adds a second trigger blocking `is_auto=true` todos for free
plan (manual todos, the app's default, stay allowed) — paired with an
app-level skip in the `daily-todos` cron loop that filters free-plan
companies out *before* the AI-polish call, so the DB trigger is a backstop,
not the only thing standing between free-plan and a wasted AI spend. Both
triggers verified against real local Postgres: free-plan rejected, paid
plan/manual todos allowed.

Auto-purchase-orders (`purchase-orders/from-quote`, `from-job`) and Xero
(`xero/auth`, plus `xero/sync`/`sync-credit-note` as defense in depth for a
company that connected while paid and later downgraded) gated server-side
and their UI buttons swapped to a greyed-out "Upgrade" link, matching the
pattern from pt.2's logo-upload gate. Checked whether `quotes.is_estimate`
(the "estimate vs firm quote" checkbox) was a distinct feature to gate —
it's cosmetic only (swaps a label, no other logic branches on it anywhere),
so left alone.

`tsc` clean, `eslint` 0 new errors (confirmed every pre-existing error
belongs to a file this session never touched, via `git diff` against each).

## Session 2026-08-17 (Claude, pt.2) — GST-on-actuals bug, free plan, referral program

Three pieces of work, the first a live bug report that interrupted the other
two mid-build.

**Bug: `job_materials`/`timesheets` ignored `prices_include_tax`, double-
charging GST.** User reported a job showing $11.50 for two $5 line items with
"Prices include GST" ticked. Quotes have always correctly handled this via
`lineNet()` (`lib/pricing.ts`) — the same tax-inclusive-entry logic had simply
never been applied to job_materials/timesheets (used for quote-less
time-and-materials jobs), so `unit_price` was always treated as GST-exclusive
and GST got added a second time. Root-cause fix, not a patch: this exact
calculation had been independently copy-pasted across **five** call sites
over several past sessions, all fixed the same way (`lineNet(qty, unit_price,
null, 0, gstRate, pricesIncludeTax)` in place of raw `qty * unit_price`) —
`jobs/[id]/page.tsx` (Job total + Job Costing card), `jobs/[id]/client.tsx`
(actual invoice-creation from the web UI), `customers/[id]/page.tsx`
(customer "To invoice" stat), `api/invoices/route.ts` (the real
invoice-creation route, also used by mobile), `lib/batch-invoice.ts` (bulk
"Invoice and Print"). Checked `api/invoices/bulk/route.ts` and the mobile app
separately for the same duplicated logic — neither has it, nothing to fix
there. New `scripts/check-actuals-gst.mjs` reproduces the exact reported
$5+$5 scenario (now correctly reconstructs to $10.00) plus confirms
GST-exclusive shops are unaffected — passing. **Not yet click-tested live**
against the user's actual job.

**Free tier.** Previously, a lapsed trial with no active subscription hit a
hard paywall (`hasAccess()` → `redirect('/upgrade')`, `(dashboard)/layout.tsx`)
— no floor below "pay or lose access". New `effectivePlanKey()`
(`lib/billing.ts`) resolves the plan that actually governs limits right now
(active subscription → real plan; inside trial window → `'trial'`; otherwise
→ new permanent `'free'` floor) since the raw `subscription_plan` column
never transitions on its own once a trial lapses. `hasAccess()` now always
returns `true` — kept as a named function (not deleted) as a single future
choke point, but every company has *some* access now. `/upgrade`'s own
redirect-away-if-entitled logic changed from `hasAccess()` (now always true,
which would make the page unreachable) to `subscription_status === 'active'`,
so free/trial companies can still see it.

Free plan: 1 seat (`lib/plans.ts`, reuses the *existing* seat-cap check in
`api/auth/invite/route.ts` — just needed to read the effective plan instead
of the raw column), 3 active jobs, 10 customers. Volume caps enforced with a
**DB trigger**, not just an app-level check
(`20260817100000_free_plan_row_caps.sql`, mirrors the
`job_is_locked()`/`block_write_if_job_locked()` pattern from
`20260815100000`) — because customers have no server route at all (client
inserts straight via Supabase JS) and jobs are also created offline on mobile
via PowerSync, both bypassing any app-layer-only check. `company_effective_
plan()` in SQL intentionally duplicates `effectivePlanKey()`'s logic, flagged
as the same kind of drift risk as `job_is_locked()` vs `invoiceGuard()`.
Verified against real local Postgres, not just reasoning: 10th customer
allowed/11th rejected, 3rd job allowed/4th rejected, completing a job frees
an active-job slot, paid and billing-exempt companies are never capped.

"Powered by www.industryforms.app" now appears on invoice and job-sheet PDFs
when `effectivePlanKey(company) === 'free'` (threaded through as a boolean,
not the raw plan key, so the PDF components don't need to know plan-
resolution rules) — `/q/[token]`'s public quote page already had an
unconditional "Powered by" line from an earlier session, left as-is
(unconditional, free marketing, touching it risks a regression for no
benefit). Logo upload greyed out on free plan in Settings, with a server-side
backstop in `api/storage/upload-url` (the actual `logo_url` write goes
straight from the browser to Supabase, so the presigned-URL step is the one
real choke point). New slim, dismissible `FreeTierBanner` in the dashboard
layout — deliberately **not** a rotating carousel (flagged as a UX risk when
asked to build one: this app has already avoided pushy patterns elsewhere,
e.g. the 2026-08-16 pt.2 mobile-app nudge). Message varies by day-of-month
rather than a timer, so it's not stale without being an in-page motion nag.

**Referral program.** Existing customer refers a friend; each of the
friend's first 3 paid months credits the referrer's own Stripe customer
balance by the referrer's own plan price, stacking independently across
multiple referred friends. New `referral_credits` ledger table
(`20260817110000_referral_program.sql`, service-role-write-only, same shape
as `sms_usage_events`) with a `unique(referred_company_id, month_number)`
constraint that's the actual concurrency guard: the row is inserted *before*
any Stripe call, atomically claiming the slot, so a webhook retry can't
double-credit; a `stripe_credit_applied` flag means a retry that finds its
row already claimed safely retries only the Stripe call, never the counting.
Verified against real local Postgres: 3 credits succeed, a 4th (`month_number
4`) rejected by a check constraint, a duplicate `month_number` for the same
friend rejected by the unique constraint, a replayed `stripe_invoice_id`
rejected, and `authenticated`/`anon` roles confirmed unable to write directly
(RLS deny, service-role only).

New `invoice.paid` case in the Stripe webhook (net-new — no prior handler for
that event) does the actual crediting, gated on: not an add-on subscription
invoice (checked via `invoice.parent.subscription_details.metadata.addon` —
**this exact field path was confirmed against the installed `stripe` SDK's
own `.d.ts` files**, not assumed from training data, since this codebase is
on a materially newer Stripe API version — `invoice.subscription` no longer
exists at the top level, it's nested under `parent.subscription_details`
now); the paying company having `referred_by_company_id` set; under the
per-friend cap of 3. Self-referral guard compares Stripe default-card
fingerprints between referrer and referred customer (skipped if the referrer
has no Stripe customer yet — nothing to compare, and one gets lazily created
at credit time anyway, mirroring the exact pattern already used in
`api/billing/addon/route.ts`).

Referral code (`companies.referral_code`, 8-char, generated per-company at
signup with a collision-retry loop; `companies.referred_by_company_id`, set
once, never changed) captured via `?ref=` on `/signup` — same prefill
pattern the page already used for `?email=` — into an editable field, not
just a hidden pass-through, since someone might get a code verbally. Signup-
time self-referral guard (matching billing-email domain) is a second,
independent check from the payment-method one in the webhook. New
"Referrals" tab in Settings (9th tab, matches the file's existing inline-tab
convention) shows the referral link + a copy button and each referred
friend's "`X` of 3 months earned" progress, fetched server-side.

**Not verified**: no runnable check for the webhook logic itself beyond the
schema-level Postgres checks above — the actual Stripe API shape and the
`createBalanceTransaction` call need a real Stripe test-mode event, which
this session didn't have. See Action items above.

## Session 2026-08-16 (Claude, pt.3) — Payment reliability sweep, payment terms, Tap to Pay checklist

Long session, mostly triggered by a batch of live bug reports. Grouped by
theme; commits are on `main` between `a2a4b54` (pt.1/pt.2, above) and
`0b0e2eb`.

**Payment reliability sweep** — several independent bugs in the Stripe
Connect direct-charge path, found while chasing user reports one at a time:
- `app/api/bookings/refund/route.ts` was missing `connectOptions(company)`
  (flagged, not fixed, in the pt.1 credit-notes entry above) — fixed.
- `estimatedSubtotal`/job-sheet PDF totals were summing `quantity*unit_price`
  instead of the already-tax-extracted `line_total` — double-counted GST on
  top of tax-inclusive prices. Same bug hit progress-claim invoicing (caught
  in a follow-up reality-check pass — it set an explicit `due_date` that
  skipped the new payment-terms trigger too, see below).
- **Public invoice/booking-deposit payment was fully broken** on two fronts:
  (1) the Payment Element mounted on a bare `setTimeout(50ms)` racing
  React's render commit — lost often enough on phones that it silently never
  mounted; (2) even after fixing that, Stripe.js was never loaded scoped to
  the connected account (`loadStripe(pk, {stripeAccount})`), so a
  direct-charge clientSecret couldn't resolve and the Payment Element
  rendered completely blank. Both fixed; a reality-check pass then caught a
  *third*, self-inflicted regression — `submitPayment()` switched React
  state away from the `'form'` step as its first line, which unmounted the
  Payment Element while `confirmPayment()` was still awaiting it.
- **Built proper 3DS redirect handling**, since a real card can still force
  a top-level redirect despite `redirect: 'if_required'`: `getOrCreatePaymentIntent()`
  (`lib/stripe.ts`) reuses an open PaymentIntent across retries instead of
  orphaning a fresh one per attempt (needed `invoices.stripe_payment_intent_id`,
  migration `20260816110000`); both `pay-button.tsx` and `booking-widget.tsx`
  now detect a redirect return and show a real succeeded/processing/failed
  state. Reality-check pass caught two more here: 'processing' PaymentIntents
  were being treated as reusable (Stripe rejects re-confirming one), and
  `booking-widget.tsx` trusted booking id/amount from URL query params
  before verifying them — fixed by a new public
  `GET /api/bookings/resolve-deposit-intent` that resolves those
  server-side from Stripe's own record instead (Stripe.js doesn't expose
  PaymentIntent.metadata to client-side retrieval even with the real
  clientSecret, so this had to go through the server regardless).

**Mobile auth migration** — `/api/messages/{conversations,thread,action}`,
`/api/sms/send`, and `/api/bookings/[id]` PATCH all used a cookie-only
`getUser()` check, so every mobile request (Bearer token, no cookie) 401'd
regardless of role — the reported "Inbox unauthorised" bug. Switched to
`resolveCompanyUser()` (already used elsewhere for this) and added explicit
`company_id` filters everywhere the old code leaned on RLS, since the
service client bypasses it. Also: Stripe Terminal Location now runs
`company.phone` through the existing `toE164()` helper (leading-0 NZ/AU
numbers were rejected by Stripe); mobile got a manual time-log "+ Add"
button (the create-mode UI already existed, just nothing opened it) and a
job-site picker (RLS already allowed it, purely a missing screen); "Get
paid" moved from the Subscription tab to Integrations (it's an external
connection like Xero, not a plan/billing setting).

**Job totals now come from the job, not just the quote** — a job created
without a quote (e.g. the quick "New job" dialog) always showed $0.00
everywhere, with no ceiling to invoice against. `estimatedSubtotal`/
`financialJobTotal` now fall back to the job's own logged materials +
billable labour when there's no quote. Two reality-check follow-ups: the
customer page's own "To invoice" stat had the same gap independently (now
fetches the same fallback data); the "fully invoiced" lock banner was
computed from the new fallback-inclusive total, so a quote-less job could
show "locked" even though the DB trigger (`20260815100000`) only ever locks
a *quoted* job — banner now checks the quote total directly, matching the
trigger exactly. A third gap (mobile's `/api/invoices` had its own,
separate jobTotal computation that never got this fallback, so a
quote-less job could still be re-invoiced after "full" on mobile
specifically) was caught later, unprompted, and fixed the same way.

**New feature: per-customer payment terms.** `invoices.due_date` was never
set by any code path before this — always null. Three term shapes (due on
receipt / net N days / a fixed day of the *following* month, clamped to
that month's last real day) live on `companies` (default) and `customers`
(optional override), computed by a `BEFORE INSERT` trigger
(`compute_invoice_due_date()`, migration `20260816120000`) rather than in
app code, so every invoice-creation path gets it for free. Verified against
real local Postgres (`scripts/check-payment-terms.mjs`) including the
month-rollover + last-day clamp. Reality-check pass caught progress-claim
invoicing setting an explicit `due_date` that bypassed the trigger — fixed
(see payment reliability sweep above).

**Inbound email rewritten for Resend Inbound** — the enquiry-inbox email
bounced "address not found" because `inbound.industryforms.app` has no MX
record at all (nothing was ever set up to receive mail there). Also, the
existing webhook handler was built for a generic flat inbound-parse payload
(Mailgun/SendGrid style), not what got chosen: Resend Inbound, whose
`email.received` webhook is Svix-signed and metadata-only — the body needs
a separate `resend.emails.receiving.get()` call. Rewritten accordingly. DNS
+ webhook subscription + `RESEND_WEBHOOK_SECRET` are still owed (see Action
items above).

**Website**: founder section now credits Josh & Edin ("we" instead of "I")
in three places; widened the Xero/Stripe/Google Calendar logo row's gap.

**Two migrations applied to production this session**
(`supabase db push --linked`): `20260816110000_invoice_payment_intent_id.sql`,
`20260816120000_payment_terms.sql`.

**Security audit + a final reality-check pass** were run across the whole
session's diff (`a2a4b54..4d80aae`). Security audit: two candidates
surfaced (public `resolve-deposit-intent`'s lack of ownership check; the
payment-terms trigger not scoping `customer_id` to `company_id`), both
filtered out on a dedicated false-positive pass — the first requires
already possessing an unguessable Stripe id, the second inherits a
structural gap in `invoices.customer_id` that predates this session (no
FK/RLS cross-company constraint has ever existed on it — noted here as a
defense-in-depth item, not fixed, since it's pre-existing and out of scope).
The mobile auth migration (the largest, riskiest-looking change) came back
clean, every query correctly scoped. A final holistic reality-check pass
covering the four earliest commits of the session (never adversarially
reviewed before) was interrupted by a session/token limit before finishing
— worth re-running if picking this up cold.

**Apple Tap to Pay submission checklist** (`App Review Requirements
Checklist 1_6 (completed).xlsx`, outside this repo — Google Drive, JE Group
Ltd/IndustryForms/App Releases/Apple/Tap to Pay Submission Assets/) was
reviewed against the actual code and updated in place:
- Implemented and now **Yes**: 1.4 (iOS < 17.6 gets a proactive "update iOS"
  message — the SDK has no matching error code to catch reliably), 3.4
  (Tap to Pay now surfaced at the end of the welcome tutorial, the app's
  real onboarding flow), 5.9 (declined/timed-out/cancelled/failed now
  distinguished in plain language instead of a raw SDK string).
- Corrected to **Yes**, no code needed — already true, checklist was stale:
  4.7 (PIN accessibility — already in `tap-to-pay-help.tsx`), the referenced
  Stripe refund row (already live via credit-notes, and it covers Tap to
  Pay payments specifically since they settle through the same
  `payment_intent.succeeded` → `record_stripe_invoice_payment()` path as
  any other Stripe invoice payment), and the two flow recordings (both
  `.mp4`s now sit in the assets folder).
- **4.1 (ProximityReaderDiscovery) marked N/A**, deliberately not forced to
  Yes: the app integrates through the Stripe Terminal SDK, the correct path
  for a PSP integration — calling Apple's raw API directly would mean
  bypassing Stripe's SDK entirely. The education sub-requirements this row
  exists to gate (4.5–4.8) are independently satisfied already. Worth a
  second opinion from Stripe/Apple before submitting if there's any doubt.
- Untouched, still need a human: HIG/Marketing-guide design review,
  onboarding-speed and reader-warm-up timing (need a real device), regional
  requirements, localization string wording, and the two "mechanism built,
  not yet sent" marketing items (launch email + push) — those are one-shot
  sends to real users, intentionally not triggered as a side effect of a
  checklist review.

## Session 2026-08-16 (Claude, pt.2) — Mobile visitors nudged toward the Android app on signup/login

Marketing site CTAs ("Start Free Trial") all point straight at
`app.industryforms.app/signup`, so a phone visitor clicking through was
signing up in the web app's desktop-shaped form with zero indication a real
app exists. New `components/mobile-app-nudge.tsx`, dropped into `/signup`
and `/login`.

**Pure CSS (`md:hidden`), no user-agent sniffing, no client JS for
detection** — the same responsive convention already used everywhere in this
codebase (sidebar collapse, etc.). Viewport width is a reliable enough proxy
here since nothing about this feature needs to distinguish device *type*,
only screen size.

**Deliberately not a hard block or auto-redirect.** Initial company setup
(price list, business settings) is genuinely a desktop-shaped task even for
an owner who'll live in the phone app day-to-day, and blocking or bouncing a
mobile visitor away from signup would cost real conversions over device
friction — contradicts the "no pushy sales tactics" positioning already
established for this product (`PROJECT_BRIEF.md`). It tells, doesn't gate:
Android Play Store link, honest "iPhone app is coming soon" note (matches
the marketing site's own existing framing), and the form underneath still
works if they'd rather continue on the phone.

Verified live in a real browser at both breakpoints (375px and desktop),
not just typechecked — banner renders correctly on `/signup` at mobile
width, confirmed absent on `/login` at desktop width.

## Session 2026-08-16 (Claude) — Credit notes: refund or account credit, applied to a future invoice

Full design in `CREDIT_NOTES.md` — this is the summary. Two scope questions
were asked up front (refund-vs-account-credit choice, and whether to push
real Xero Credit Notes) since the two readings would have produced very
different code on a money-critical feature; user picked the fuller option
both times, so this shipped as a genuinely complete feature, not a stub.

**New tables**: `credit_notes`, `credit_note_applications` (a join table,
since one credit note can be split across several future invoices and one
invoice can draw from several credit notes). Reuses the existing generic
`assign_doc_number()` trigger for `CN-0001`-style numbering rather than a
bespoke counter — same pattern quotes/invoices/jobs/POs already use.
Deliberately **not** added to `sync-rules.yaml`/PowerSync: invoices are
already owner/admin-only and staff devices never sync quotes/invoices at
all, so there's no mobile audience for this feature, and skipping sync
entirely sidesteps the publication/backfill trap this project has hit twice.

**A real gotcha, found only by inserting against real Postgres**:
`doc_counters.kind` carries its own inline whitelist check constraint,
completely separate from the generic numbering trigger, which gave no hint
it existed. Every insert into `credit_notes` hard-failed until the migration
also widened that constraint. Documented in root `CLAUDE.md` under "Adding a
new document type" so the next new document type doesn't hit the same wall
blind.

**Money mechanics**: `lib/credit-notes.ts` — `maxCreditableAmount` (can't
credit more than an invoice was ever billed), `maxRefundableAmount`
(refunding is separately bounded by what actually went through Stripe on
that invoice — a bank-transfer payment has nothing to reverse), and FIFO
allocation across a customer's active credit notes when applying credit
later. All amounts are GST-inclusive throughout, matching `invoice.total`
and what a Stripe refund actually moves.

**Xero**: pushes a real `ACCRECCREDIT` Credit Note (not a negative invoice —
the accounting-correct document type), and best-effort pushes an Allocation
when credit is applied, if both sides are already synced. Both manual
actions, matching how this app has never auto-synced anything to Xero.

**Applying credit is draft-only** — reuses the existing "Revert to draft"
escape hatch rather than growing a second unlock path, since
`invoice_line_items` are already locked to draft-only at the RLS layer.

**Found and flagged, not fixed**: `app/api/bookings/refund/route.ts` doesn't
pass `connectOptions(company)` to its Stripe refund call, unlike every
PaymentIntent-creating route in this app. If a booking deposit was ever
collected as a direct charge, refunding it would fail with "No such
payment_intent" — the exact bug class root-caused in the 2026-08-12 Tap to
Pay session. Out of scope for this pass; spawned as a background task
(`task_8b53ec2c`) rather than silently fixed or silently ignored.

**Verified against real local Postgres** (not just typechecked): sequential
per-company `CN-` numbering, independent counters per company, both check
constraints (`amount_applied <= amount`; a `refund` note can't carry
`amount_applied > 0`) firing correctly, and confirmed a failed insert
doesn't burn a document number. `tsc`/`eslint` clean; new
`scripts/check-credit-notes.mjs` covers every boundary in the pure math.
**Not verified**: an actual Stripe refund call and an actual Xero
CreditNote/Allocation push — both need a live sandbox this session doesn't
have. `supabase db push --linked` still owed.

## Session 2026-08-15 (Claude) — Lock a job once it's invoiced in full

User picked "full freeze" (everything locks except messages) with an
owner/admin unlock escape hatch, from an explicit scope question — the two
readings ("lock billing data only" vs "lock everything") would have produced
very different code, so this wasn't guessed at.

**Enforced with a DB trigger, not app-level checks** — deliberately mirrors
`20260807110000_lock_invoice_financials_to_draft.sql` (which locks a *sent*
invoice's own fields) applied to the job side instead. A trigger is a hard
stop regardless of write path — web, mobile online, mobile's PowerSync
sync-on-reconnect, or a direct API call — where an app-level check only
covers the one path it's written into. It also gives a friendly custom error
message; a bare RLS denial would just say "new row violates row-level
security policy."

**"Fully invoiced"** = job has a `quote_id` and live (non-void) invoice
subtotals sum to at least the quote total, same EPS as `invoiceGuard()` in
`lib/job-financials.ts` — the two are deliberately kept in sync rather than
sharing code (SQL trigger vs TS), flagged in both places' comments as a drift
risk to watch.

**Migration** `20260815100000_lock_job_once_fully_invoiced.sql`:
- New `jobs.invoice_lock_override` (the escape hatch).
- `job_is_locked(job_id)` — the one predicate every trigger below calls.
- One generic `block_write_if_job_locked()` trigger, applied via a `DO` loop
  to `job_materials`, `timesheets`, `job_visits`, `job_assignees`,
  `job_photos`, `form_submissions`, `compliance_documents`,
  `purchase_orders`, `progress_claims` — one function instead of nine
  near-identical trigger bodies.
- `job_notes` gets its own trigger: `kind='message'` rows are always
  writable (that's the whole point of the 2026-08-12 messaging feature),
  only `kind='note'` rows lock.
- `jobs` itself gets a narrower trigger, `block_job_edit_if_locked()`, using
  a `jsonb` diff rather than hand-listing every other column (so it doesn't
  quietly stop covering a column a future migration adds). Two carve-outs:
  - **A bare status-only change is allowed even when locked.** On mobile,
    completing a job runs its status UPDATE **after** the invoice that
    creates the lock — deliberately, per an existing code comment: "a failed
    invoice must not complete the job." Traced every write path on both
    platforms before writing this trigger specifically because of that
    ordering; without the carve-out, completing a job via mobile would have
    immediately locked itself out of the one write that legitimately follows.
  - Toggling `invoice_lock_override` itself is always allowed — otherwise
    nothing could ever unlock a locked job.
- Same WAL-backfill trap as every prior sync-sensitive migration this
  project has hit: `ALTER TABLE ADD COLUMN` doesn't backfill existing rows
  through logical replication, so a no-op `update jobs set id = id` forces
  them through. Unlike `job_notes` (2026-08-12, no `updated_at`), `jobs`
  **does** have an `updated_at`-bumping trigger, so the backfill runs under
  `session_replication_role = 'replica'` to avoid falsely touching every
  job's timestamp — the exact mistake the 2026-08-02 outage fix was written
  to avoid.
- `sync-rules.yaml` needed **no edit** — both streams already `SELECT
  jobs.*`, so the new column reaches devices automatically.

**UI**: web gets a `JobLockBanner` component (banner + Unlock/Re-lock,
owner/admin only) computed server-side in `page.tsx` by reusing
`invoiceGuard()` against data the page already fetches. Mobile needed a
different approach — **quotes are deliberately never synced to staff
devices** (`sync-rules.yaml`'s own header comment: "Never quotes/invoices"),
so a technician's phone has no local data to compute "fully invoiced" from
at all. New `GET /api/jobs/[id]/lock-status` (server-side, same
`invoiceGuard()` reuse) exists specifically for this — it's mobile-only,
web doesn't call it. Every other write action's existing error handling
(`toast`/`Alert.alert` on failure) already surfaces the trigger's message
verbatim, so individual "Add" buttons across `materials.tsx`,
`photo-upload.tsx`, `visits-card.tsx` etc. were deliberately **not**
disabled one by one — the banner is the primary signal, the trigger's
friendly error is the fallback if someone tries anyway. `invoice_lock_override`
added to both apps' PowerSync client schemas for completeness, though
neither app reads it locally today.

**Caught while writing the mobile side**: a first draft used `confirm()` for
the unlock prompt — that's a browser API with no equivalent in React Native
and would have crashed the app on first tap. Caught before it shipped;
replaced with `Alert.alert`'s two-button form.

Verified: `tsc --noEmit` and `eslint` clean on every touched file across both
apps; `check-sync-rules.mjs` (still 45 queries, still passing — no rules
edit was needed) and the existing `check-invoice-guard.mjs` /
`check-job-financials.mjs` all pass unchanged.

**The trigger itself was verified against real local Postgres**, not just
typechecked — local Supabase came up successfully this attempt (it had
failed twice earlier in the session, see the pt.1/pt.2 entries above; Docker
Desktop's engine, not this migration). Ran a 12-case transaction against a
real seeded job (rolled back after, no data persisted): unlocked before any
invoice → material insert succeeds → insert a full-amount invoice → job
reports locked → material insert **and** delete both rejected with the
friendly message → **the mobile-ordering carve-out confirmed for real: a
bare status-only update still succeeds while locked** → a status change
bundled with any other field change is rejected → a `kind='message'` insert
succeeds while locked → a `kind='note'` insert is rejected → toggling
`invoice_lock_override` succeeds and immediately unlocks → a material insert
succeeds again post-unlock. Every case behaved exactly as designed on the
first real run — no fixes needed after the trigger logic itself, only a
missing `title` column in the test fixture's own `quotes` insert (schema
requirement I didn't know about, not a bug in the feature).

Not yet applied to production — `supabase db push --linked` is still owed
(see Action items).

## Session 2026-08-13 (Claude) — Sidebar toggle placement; completed jobs reinstated; Stripe disconnect/reconnect

Three user-requested changes.

**Sidebar collapse/expand now share one spot.** The collapse chevron was in
the header, the expand chevron in a separate footer block at the bottom, so
the control jumped across the screen when you used it. Collapsed state now
stacks the expand arrow under the logo mark in the same header; the footer
block is gone.

**Completed jobs are visible again, and the "All" pill is removed.** This
reverts the 2026-08-07 behaviour where a job with `status = 'completed'` and
at least one non-void invoice disappeared from Jobs entirely. Removed the
post-fetch filter and the now-unused `invoices` query that fed it, plus the
`__all__` sentinel and its pill (no `__all__` references remain anywhere).
Behaviour now: **Active** hides terminal statuses as before, and **Completed**
/ **Cancelled** each have their own pill (they come from `jobStatuses`, which
includes terminal ones) — so finished work is one click away instead of
findable only through Invoices. Mobile was never affected; that change was
web-only.

**Stripe payouts account can now be disconnected and reconnected, and shows
which account is linked.**
- `GET /api/stripe/connect/status` now returns `account_name` (Stripe dashboard
  display name → business profile name → email) and `account_id`. Not
  persisted — display-only, and a local copy would just go stale.
- New `POST /api/stripe/connect/disconnect`, owner/admin only (it stops every
  card payment the company can take, so not a staff action).
- `disconnectAccount()` in `lib/connect.ts` **does not delete the Stripe
  account** — it's an Express account that may hold a balance, pending payouts
  and payment history, and Stripe refuses deletion with a non-zero balance
  anyway. It only unlinks locally; the merchant keeps the account in their own
  Stripe dashboard. Reconnecting is the normal onboarding flow, which creates a
  fresh Express account.
- **Critically it also clears `stripe_terminal_location_id`.** That column
  points at a Terminal Location living on the *old* connected account, so
  leaving it set would make the next Tap to Pay attempt reuse a location the
  new account cannot see — the same class of cross-account mismatch currently
  being chased in pt.3 above.
- `companies.stripe_customer_id` is deliberately untouched: that's the
  platform-side subscription customer, nothing to do with the connected account.
- Disconnect is offered in both the "Payouts active" and "Setup incomplete"
  states — a half-finished account attached to the wrong entity can only be
  escaped by disconnecting it.

Verified: `tsc --noEmit` and `eslint` clean across every touched file.
**Not verified in a browser** — all three surfaces sit behind auth and the
local Supabase stack is down (Docker Desktop killed the containers twice this
session, see pt.1). Worth a click-through when it's back up, particularly the
Completed pill actually listing invoiced jobs.

## Session 2026-08-12 (Claude, pt.3) — Tap to Pay: Stripe Terminal Location missing address[city]

**The 2026-08-07 try/catch fix paid off exactly as intended.** That session
added error handling to `app/api/stripe/terminal/*` so the real Stripe error
would surface instead of the generic "Could not resolve a Terminal location",
and noted the underlying cause couldn't be confirmed without a live sandbox.
It surfaced on a real device this session: **"Missing required address field
for a Location in NZ: address[city]."**

**Root cause**: `ensureTerminalLocation()` in `lib/connect.ts` built the
Location address from `companies.address` alone — `{ country, line1 }`. Stripe
requires a *structured* address with `address[city]` for NZ (and AU)
Locations. `companies` has a single free-text `address text` column and **no
city/postcode columns anywhere** (confirmed across all migrations), so there
was nothing to populate it from.

**Fix**: read the structured address Stripe already collected and verified
from the merchant during Express onboarding —
`accounts.retrieve()` → `company.address` (business) → `individual.address`
(sole trader) → `business_profile.support_address`. Deliberately **not**
parsing a city out of the free-text field: a guessed value would be written
onto the merchant's Stripe compliance record, which is worse than failing.
Also avoids adding address columns + settings UI for data the merchant has
already given Stripe. Safe by the time it runs — the route gates on
`charges_enabled`, so onboarding is complete.

If Stripe holds no usable address, the user now gets an actionable message
("complete your address with Stripe, then try again") rather than a raw API
error.

No runnable check added: the logic is a three-way `??` fallback plus a
null guard, and a test asserting `a ?? b ?? c` picks `a` would be theatre.
The part that can actually fail — whether Stripe accepts the resulting
address — is only verifiable against Stripe.

**Unverified**: not exercised against a real Stripe account (the Stripe MCP
connector needs auth this session couldn't perform, and there's still no live
Terminal sandbox). Next Tap to Pay attempt either works or returns the new
actionable message. **Worth checking first**: whether this company's
connected account actually has a city on file in Stripe — if it doesn't, the
fix is correct but the merchant still has to complete their Stripe address.

**Update, same day — the address fix worked, next error in the chain
appeared: "No such payment_intent."** That does NOT mean the PaymentIntent is
missing — `/api/stripe/terminal/payment-intent` created it successfully. It
means the Terminal SDK is looking somewhere it isn't: a different connected
account, or the other livemode (test vs live). Traced the whole chain —
`connectOptions()` (`lib/stripe.ts`) is used identically by all three Terminal
routes (connection-token, location, payment-intent), so the server side is
consistent. Found one genuine latent bug: `StripeTerminalInitializer`
(`tradiee-mobile/app/_layout.tsx`) initialises the SDK **once per app process
and never re-binds** — sign-out wipes PowerSync but never resets Terminal, so
the account binding can go stale if Connect onboarding finishes mid-session or
someone switches company without restarting. Couldn't confirm that's *this*
failure though, so didn't ship it as the fix.

Instead made the next attempt self-diagnosing, same move that cracked the
address bug: `payment-intent` now echoes back `account` (the `stripeAccount`
option actually used) and `livemode`; `pay-now.tsx` names both in the error
when it sees "No such payment_intent" — *"Created on acct_x in live mode, but
the reader session is looking elsewhere. Fully close and reopen the app…"*
**Still unresolved** — needs a real retry to know whether it's the stale
initializer or a live/test key mismatch.

## Session 2026-08-12 (Claude, pt.2) — Android keyboard covering forms; duplicate invoice on a fully-invoiced job

Two user-reported bugs, both root-caused rather than patched at the reported spot.

**[Android] Keyboard covered the form on the customer-details screen — and 9
other screens.** `KeyboardAvoidingView` was mounted everywhere, but with
`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — i.e. **no
avoidance at all on Android**, which is the only platform actually shipping
(iOS isn't submitted). `AndroidManifest.xml` does set
`windowSoftInputMode="adjustResize"`, which is why most of the app looks fine;
but `adjustResize` does not reach content inside a React Native `<Modal>`, and
these forms are all modal-hosted, so nothing moved. Fixed at all **13 sites
across 10 screens** (`customers/new`, `customers/[id]` ×2, `enquiries`,
`invoices/[id]` ×2, `messages/[key]`, `profile`, `quotes/new`, `signup`,
`timesheets` ×2, `todos`) rather than just the reported one — it's an
identical one-token change and the other nine were the same bug waiting to be
reported. `'height'` matches the 7 screens that already handled Android
correctly (`jobs/[id]`, `jobs/new`, `login`, `quotes/[id]`, …).

**[Both apps] A fully-invoiced job would silently generate a second empty
draft invoice.** Root cause is precise: in `app/api/invoices/route.ts` the
`type='full'` path sets `subtotal = 0` when nothing is left to bill (correct —
a further invoice is for variations, so it starts empty), but the
over-invoicing guard below it tested `subtotal > EPS`, which is then false. So
the guard never fired and a second invoice was created with no prompt,
consuming a job-derived invoice number and completing the job. Web wasn't
affected the same way (it has its own `confirm()` and does **not** call this
route — the two clients duplicate invoice-creation logic, which is worth
knowing but was out of scope to unify here).

Fixed by extracting both guards and, critically, **their ordering** into
`invoiceGuard()` in `lib/job-financials.ts`, used by the API route so the two
clients can't drift. New `'fully-invoiced'` guard is checked **before**
`'over-quote'` — the whole bug was that the more general check ran first and
its `subtotal > EPS` test masked the specific case.

Per the user's spec, the prompt now offers the existing invoice: mobile shows
a two-button `Alert` ("No, create another" / "Yes, go to invoice"), web shows
a `Dialog` with "Go to invoice" / "Create another invoice". Web deliberately
uses the existing `Dialog` rather than `confirm()`: with `confirm()`, "No =
create another" means a stray Esc silently burns an invoice number and
completes the job. Dismissing the dialog does nothing. The API returns the
existing invoice's id/number on the 409 so both clients can link to it;
`page.tsx` passes the newest live invoice to the web client as a prop.

**Runnable check**: `node scripts/check-invoice-guard.mjs` (from
`tradiee-app/`) — the exact shipped bug (fully invoiced + `subtotal: 0` must
still prompt), the guard ordering, T&M jobs with no quoted ceiling staying
unblocked, `force` retries, and sub-cent float boundaries. All passing.

Verified: `tsc` clean both apps, `eslint` clean on touched web files, the new
check plus the existing `check-job-financials.mjs` both pass. **Not verified
on a device or against real data** — the Android keyboard fix in particular
needs a real phone to confirm, since that's the whole point of the bug.

## Session 2026-08-12 (Claude) — Admin ↔ technician job messaging

Built the two-way in-app messaging feature scoped in `JOB_MESSAGING_SCOPE.md`.

**The architectural call: messages are `job_notes` rows with `kind='message'`,
not a new table.** `job_notes` already had the exact shape (`job_id`,
`author_id`, `body`, `created_at`), was already in the `powersync` publication
and BOTH `sync-rules.yaml` streams, was already in both apps' PowerSync client
schemas, and its RLS already scoped SELECT to owner/admin-or-assignee with
INSERT open to any company member — exactly the visibility a job thread wants.
A new table would have meant redoing all of it, **including the publication
add + backfill whose omission caused the 2026-08-02 outage**. Reusing cost
zero of that: `sync-rules.yaml` was not touched at all (`check-sync-rules.mjs`
still passes, 45 queries).

**The one real trap, and it's the same trap as 2026-08-02**: `ALTER TABLE ADD
COLUMN` does **not** re-emit existing rows to logical replication, so every
already-synced `job_notes` row would have reached devices with no `kind` at
all and a `kind = 'note'` filter would have silently matched nothing — every
existing note vanishing from the app. Handled two ways, belt and braces:
migration `20260812100000_job_messaging.sql` ends with `update job_notes set
id = id` to force the rows through the WAL (safe as a plain UPDATE here,
unlike the 2026-08-02 fix — `job_notes` has no `updated_at` and no triggers),
**and** the mobile PowerSync query tolerates `kind IS NULL` for notes, since a
device can sit offline for days holding pre-migration rows.

**Chatter must never reach the job sheet.** `job_notes` renders on the
job-sheet PDF (`components/pdf/job-sheet-pdf.tsx:279`), so the `kind` filter
and the column landed in the same commit — there is no window where the
column exists but the PDF is unfiltered. Web `page.tsx` now runs two separate
queries (`kind='note'` desc for the notes list + job sheet, `kind='message'`
asc for the thread); mobile filters its local query. Both write paths set
`kind` explicitly rather than leaning on the column default.

**Files**: migration above; `POST /api/jobs/[id]/messages` (new — goes through
a server route rather than a direct client insert because the push step needs
the service client to read others' `expo_push_token`, matching how
`/api/sms/send` works; re-checks the RLS predicate manually since the service
client bypasses RLS); `notifyJobThread()` + the pure `jobThreadRecipients()`
in `lib/push.ts`; `messages-card.tsx` (web, above the Job notes card);
Messages section in `tradiee-mobile/app/jobs/[id].tsx` (above Notes); `kind`
added to both PowerSync client schemas.

**Push routing was free** — `data.screen: 'job'` is already handled by the
mobile notification response listener (`app/_layout.tsx:137`), so tapping
opens the job with no new code. No new notification category: the lock-screen
Reply/Quote/Call actions on `inbox_message` are customer-SMS specific.
Recipients are *every participant except the author* (all owner/admins + all
assignees) rather than branching on who wrote it — simpler and more correct,
since a second worker on a multi-assignee job needs the conversation too, and
it exactly matches the read visibility RLS already grants, so nobody is ever
pushed a message they couldn't open.

**Runnable check**: `node scripts/check-job-thread-recipients.mjs` (from
`tradiee-app/`) covers the recipient branch — author excluded, unassigned
staff excluded (the information-leak case: a push body would surface a job's
contents to someone RLS blocks), all assignees included, owner/admin always
included, null push tokens dropped before they reach Expo. All passing.

**Deliberately not built** (documented cuts, not oversights):
- **Unread badges / read state.** `job_thread_reads` from the scope doc was
  skipped — push already tells you something arrived, and an unread badge
  needs UI in both apps to be worth anything. Adding the table now would be
  dead schema. Small follow-up if wanted.
- **Author names on mobile.** `profiles` is not in the mobile PowerSync client
  schema, so a name can't resolve offline, and adding it would mean the
  sync-rule/publication changes this whole design avoided. Mobile aligns
  bubbles by author instead (mine vs theirs); web shows names (server-side
  join). Fine for the 2-3 people on one job.
- **Offline send on mobile.** Messages need the network (they go through the
  API route). Consistent with mobile's existing `addNote`, which also inserts
  straight to Supabase — and arguably correct, since a message that can't be
  delivered shouldn't look sent.
- A global cross-job DM inbox. Messages hang off a job or they don't exist.

**A live check caught a wrong assumption.** `job_notes` turns out to carry a
`company_id` column (migration 022) that the `admin_company` sync-rules stream
**joins on** — so a message inserted with a null `company_id` would sync to
staff (that stream joins on `job_id`) but never reach owner/admin devices.
The API route doesn't set it. Verified against real Postgres that this is
fine: migration 022 also installs a `set_company_id` BEFORE INSERT trigger
that derives it from the parent job. Worth knowing before anyone adds another
job_notes write path — omitting `company_id` is only safe because of that
trigger. The same discovery corrected a claim in this migration's own comment,
which asserted job_notes had no triggers.

**Verification**: `tsc --noEmit` clean on both apps; `eslint` clean on every
touched web file (mobile has no eslint config in this repo — `tsc` is its
gate); `check-sync-rules.mjs` and the new recipient check both pass. The
migration was applied to a real local Postgres and the catalog inspected
directly — `kind text not null default 'note'`, the
`kind in ('note','message')` check constraint, and `job_notes_job_kind_idx`
all present, plus the `set_company_id` trigger above.
**Not verified**: the row-level behaviour test (insert a note + a message,
confirm the split) was cut short when Docker Desktop killed the local stack
mid-run — it died twice this session, unrelated to this work. And **push
delivery is unverified** and can't be: it needs two real devices with Expo
tokens. See the action item above before trusting it in production.

## Session 2026-08-11 (Claude) — SMS provider swap Twilio → WebSMS; Tradify/Jobber/ServiceM8/Fergus comparison pages

**Why:** Twilio toll-free verification was rejected (error 30474 — the
submission identified the ISV, Industry Forms Ltd, instead of each tenant's
own end-business) and, on digging into Twilio's own guidelines, toll-free
doesn't apply to NZ/AU SMS at all — NZ requires a **dedicated short code**
(long codes, toll-free, and alphanumeric sender IDs are all unsupported for
SMS to NZ mobiles), AU wants a long code or registered alphanumeric ID. At
20,000 target users, Twilio's per-tenant ISV verification flow doesn't scale
either. Decided to move to **WebSMS** (websms.co.nz), a NZ-native aggregator,
with a dedicated NZ short code (**848484**) already provisioned.

**Update 2026-08-12:** live sending actually starts from WebSMS's shared
**group-pool short code 34567**, not 848484 — WebSMS's standard offer below
3000 msgs/month, at their own carrier registration, not ours. 848484 stays
provisioned for when volume crosses that line (see Action items). Every
mention of 848484 below describes the original plan, not what's live today.

**Code changes** (`lib/sms.ts` rewritten, same exported interface — every
caller (`quote`, `invoice`, `statement`, `send`, `reminders` routes)
needed zero changes):
- Twilio's Basic-auth REST calls replaced with WebSMS's OAuth2 client-
  credentials flow (`POST /connexus/auth/token`, 24h bearer token, cached
  in-module with a 60s refresh margin) and `POST /connexus/sms/out`
  (`messageClass: 'transactional'`).
- The existing shared-number-pool architecture (`sms_pool_sessions`,
  `WEBSMS_POOL_NZ`/`WEBSMS_POOL_AU` env vars) was **kept as-is**, just
  renamed from `TWILIO_POOL_*` — it's a pool of one number today (848484)
  but the sticky per-(company, customer) reply-routing it provides is
  exactly what's needed the moment a second number (AU, or a second NZ
  code) gets added.
- `app/api/sms/inbound/route.ts` + `app/api/sms/status/route.ts` (Twilio's
  two separate form-urlencoded webhooks) deleted and replaced by one route,
  `app/api/sms/webhook/route.ts` — WebSMS posts both inbound replies (MO)
  and delivery reports (DLR) as JSON to a single configured URL. Verified
  with `?secret=` query-param check (`WEBSMS_WEBHOOK_SECRET`, generated
  locally) since WebSMS has no per-request HMAC signature the way Twilio did.
- **Not fully confirmed**: WebSMS's live webhook JSON field names aren't
  publicly documented in detail — the route was built from their OpenAPI
  spec and query-endpoint response shapes, with fallback field names for
  the ambiguous ones. It logs the raw payload on every hit specifically so
  this can be confirmed against a real test message. Flagged in Action
  items above — do that check before fully trusting inbound replies.
- `twilio_sid` columns (`sms_usage_events`, `customer_messages`) were
  **not renamed** — they now hold the WebSMS `message_id` instead. A
  schema/rename pass wasn't worth the diff for a cosmetic naming concern.
- `.env.local`: old `TWILIO_*` vars commented out (not deleted, in case of
  rollback), new `WEBSMS_*` vars added including the short code.
  **Still needed in Vercel production** — see Action items.

Verified: `npx tsc --noEmit` and `eslint` clean on every touched file (after
clearing a stale `.next` route-type manifest still referencing the deleted
routes — known gotcha, see `feedback` memory). **Not verified live** — no
real WebSMS test message has been sent yet; that's the confirmation step
called out above.

**Also this session**: built 4 comparison landing pages
(`alternatives/tradify.html`, `jobber.html`, `servicem8.html`, `fergus.html`,
generated by `scripts/build-alternative-pages.mjs`) as a low-cost SEO/growth
play for the pre-launch (zero-subscriber) bootstrap phase, wired into every
page's footer as a new "Compare" column (`scripts/build-trade-pages.mjs`,
`scripts/build-blog-pages.mjs`, and the hand-authored `index.html`/
`blog.html`/`terms.html`/`privacy.html` all updated, footer grid widened
5→6 columns). Every competitor-weakness claim is phrased as "reviewers
report..." rather than asserted as fact, sourced from real review-site
research that session — get a quick accuracy/legal pass before these go
live, same caution as the existing ToS review action item. Also scoped (not
built) a wholesaler/association referral-partnership structure —
`PARTNERSHIP_REFERRAL_SCOPE.md`.

## Session 2026-08-07 (Claude) — 5-item bug batch: Tap to Pay, jobs→invoices, invoice lock, mobile PDF error, job-derived invoice numbers

User-reported list, root-caused (not just patched):

**[HIGH] Tap to Pay: "Could not resolve a Terminal location" — real cause was
hidden, not a Stripe SDK error.** That exact string is `tap-to-pay.ts`'s own
client-side fallback text, shown whenever `res.json().catch(() => ({}))`
swallows a JSON parse failure. Root cause: all three
`app/api/stripe/terminal/*` routes had zero try/catch around their Stripe
calls, so any Stripe-side failure became an unhandled 500 with no body — the
mobile client lost the real error and showed the generic fallback instead.
Added try/catch to `location`, `connection-token`, and `payment-intent`
routes so the actual Stripe error now reaches the user. **Could not confirm
the underlying Stripe-side trigger** (no live Stripe Terminal sandbox
available this session) — next time it fails, the real message will show
instead of the generic one, which should make root-causing it trivial.

**[HIGH] Mobile invoice PDF: "JSON Parse error: Unexpected end of input" —
identical root cause, confirmed exactly.** `app/api/invoices/[id]/pdf/route.ts`
had no try/catch around `renderToBuffer`/R2 upload; the mobile client's
`viewPdf()` called `res.json()` unconditionally (no `.catch()` fallback even
on the failure path, unlike `tap-to-pay.ts`), so an unhandled 500 with an
empty body crashed the client's own JSON.parse with that exact message.
Fixed both sides: the route now catches and returns a real error message;
the mobile client now uses the same `res.json().catch(() => ({}))` guard
already used elsewhere. This class of bug (server route with no try/catch +
mobile fetch with no `.catch()` on the error path) likely exists in other
routes too — not audited exhaustively, only the two reported.

**[MEDIUM] "Once a job is invoiced it is no longer a job."** Previously,
completed jobs only left the *default* "Active" Jobs filter — still visible
under "All". Per the user's explicit framing, changed this: a job with
`status = 'completed'` **and** at least one non-void invoice now disappears
from Jobs entirely (list, board, every status filter, search) — only
findable via Invoices from then on. A completed-but-not-yet-invoiced job
still shows (a nudge to invoice it). Applied as a post-fetch filter in
`app/(dashboard)/jobs/page.tsx` using a lightweight second query for
invoiced job_ids, not a query-builder change, so it's one filter point
covering every view uniformly.

**[MEDIUM] Sent invoices could still have their discount edited — closing
the gap 20260804120000 left.** That migration locked invoice *line items* to
draft-only but never touched the invoice's own discount/subtotal/total
fields, and the UI's Discount menu item had no draft guard at all (the code
comment literally said "stays editable regardless of status"). Fixed at
both layers: `client.tsx` now hides the whole "Add" menu (Discount included)
unless draft, and a new DB trigger
(`20260807110000_lock_invoice_financials_to_draft.sql`) blocks
discount/subtotal/gst/total changes via any direct API call once a non-draft
invoice *stays* non-draft — but allows the update when the same statement
flips status back to `draft`, which is the new **"Revert to draft"** action
added to unlock editing again (separate from the existing "Revert back to
job," which deletes an unpaid draft entirely — this one just unlocks a sent,
unpaid invoice without destroying anything). Mirrored on mobile: the edit
modal's discount fields are hidden once sent, with the same revert action
inline. Verified live end-to-end (seeded a sent invoice, confirmed Discount
menu absent, clicked Revert to draft, confirmed it reappeared) plus a SQL
regression check.

**[Feature] Invoice numbers now match their job's number.** Job J-1046's
first invoice becomes `INV-1046`; a second invoice on the same job (progress
claims, re-invoicing) gets `INV-1046-1`, a third `INV-1046-2`, etc. — matches
how the business already numbers paperwork by job. Implemented entirely in
the existing `assign_doc_number()` trigger
(`20260807100000_job_derived_invoice_numbers.sql`), so every creation path
(single job invoice, batch invoice, progress claims) gets this for free with
no application-code changes — `lib/batch-invoice.ts` already just inserts a
`'PENDING'` placeholder and lets the trigger own the real number. A new
`jobs.invoice_seq` column (atomically incremented, same row-lock pattern as
the existing per-company counters) drives the suffix and never reuses a
number even across deletes. Jobless invoices keep the ordinary sequential
counter, completely unchanged.

**Real bug my own test caught before it shipped**: job-derived numbers and
the ordinary sequential counter share the same namespace and both start
counting from 1 — a fresh company's first counter-based invoice ("INV-0001")
collided with job #1's own first invoice, which also wants "INV-0001",
causing a hard unique-constraint insert failure. Fixed by looping the
counter-fallback path past any collision (safe: `next_doc_number()` never
reuses a value, so the loop always terminates once the counter clears the
range job numbers occupy). This is exactly the kind of thing that would have
looked fine in isolated testing and then broken for real users on day one.

**Preview text may lag** — the several places that call
`nextDocNumber(..., 'invoice')` purely to show a number before creation
(pre-existing pattern, several files) aren't job-aware and weren't updated;
the trigger is authoritative regardless, so the created invoice always gets
the correct job-derived number even if a preview briefly showed the old
sequential-style one. Not fixed — cosmetic only, matches the pre-existing
documented caveat in `lib/numbering.ts`.

Verified: `tsc`/`eslint` clean on both apps. New
`scripts/check-invoice-numbering.mjs` (needs local Supabase running, unlike
the other pure-JS `check-*.mjs` scripts — this one exercises real Postgres
triggers) covers base numbering, -1/-2 suffixes, the collision-safety fix,
and the full financial-lock/revert-to-draft round trip — all passing.
Jobs-list filtering and the invoice discount-lock/revert UI verified live
against seeded local data. Committed, pushed (`3dd4a67`), and **both
migrations applied to production** via `supabase db push --linked` in the
same pass — confirmed directly against prod afterward (`jobs.invoice_seq`
column present, `next_job_invoice_seq()` callable, existing job rows
untouched with `invoice_seq` correctly defaulted to 0). One snag on push:
GitHub's secret scanning blocked the first attempt — `check-invoice-numbering.mjs`
had the local Supabase service-role key hardcoded. Since the commit had been
rejected (never reached the remote), amending it to read
`SUPABASE_SECRET_KEY` from the environment instead was safe; re-verified the
script still works before re-pushing. Checked the rest of `scripts/` for the
same pattern (`grep -rl sb_secret_`) — no other hits, this was isolated to
the one file.

## Session 2026-08-06 (Claude, pt.2) — Sidebar reorder + Quote/Estimate toggle

**Sidebar reorder** (`sidebar.tsx` + `mobile-nav.tsx`'s "more" list): Messages,
Customers, Enquiries, Quotes, Jobs, Invoices, Statements, Job Map, Schedule,
Time Logs, Vehicle Logbook, Forms, To-Do — per explicit user-specified order.

**Quote/Estimate toggle** (web + mobile): a quote can now be flagged
`is_estimate` (migration `20260806160000_quote_estimate_flag.sql`, plain
boolean, default false) — purely a display-label distinction the user asked
for explicitly: "a job has to land within a certain percentage of a quote,
whereas an estimate is a best guess." Status, numbering, and the
accept/convert-to-job workflow are all untouched; only what the document
calls itself changes. New shared `quoteLabel()` helper in `lib/utils.ts`.

Covered surfaces (deliberately scoped to where a real user — owner, staff, or
the customer — actually reads the document's name in a meaningful moment):
quote builder toggle (web checkbox / mobile `Switch`, both save
`is_estimate`), quotes list badge, quote detail page badge + toasts + accept
dialog, **the public customer-facing `/q/[token]` view** (arguably the most
important one — eyebrow now reads "ESTIMATE · Q-0001" not just the number,
accept/decline button and messages all dynamic), quote email
(`quoteEmailHtml`, subject line in `/api/email/quote`) and SMS
(`/api/sms/quote`), the quote follow-up reminder in `/api/reminders`.
Mobile: quote list card badge, detail screen badge + Alert titles + toasts,
new-quote screen toggle. PowerSync local schema (`is_estimate` on the mobile
SQLite replica) and the `quotes/[id].tsx` explicit-column SQL query both
updated — `sync-rules.yaml` already used `quotes.*` so no sync-rule change
was needed, confirmed via `node scripts/check-sync-rules.mjs`.

**Deliberately not touched** (documented scope cuts, not oversights): the
static "New Quote" page-chrome title on both apps' creation screens (set
before the toggle exists / before data loads); the one-line "Quote:
Q-0001" reference on the internal job-sheet PDF; aggregate report labels
("Quote conversion", "Quote win rate" — describe the whole mixed
quotes+estimates metric, correctly stay generic); API error strings, mobile
system-notification category labels, and help-walkthrough copy — all
low-stakes/transient text, not a "header" in the sense the user meant.

**Verified live**, not just `tsc`/`eslint` (both clean on every touched
file, both apps): local Supabase spun back up, migration applied, logged in
as the same throwaway test company from the Statements session. Confirmed
the sidebar order exactly matches spec via DOM query. Created a real
estimate through the builder — toggle flips the card header live
("Quote details" → "Estimate details"), saved correctly with
`is_estimate: true` in the DB, and every downstream surface read back
correctly: list badge, detail-page ESTIMATE badge, "Open estimate →" link
text, and critically the **public `/q/[token]` page** showed
"ESTIMATE · Q-0001" with an "Accept estimate" button. Edit page correctly
loads the toggle pre-checked for an existing estimate. Did not test
email/SMS sends themselves (same reasoning as the Statements session —
`RESEND_API_KEY`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` blanked for the
duration so nothing real gets sent); code-read confirms those paths thread
`is_estimate` through correctly. `.env.local` restored to production
values afterward, local Supabase stopped.

## Session 2026-08-06 (Claude) — Customer Statement Run (new feature)

Built the "run statements" feature: find every customer with an outstanding
invoice balance, let the owner untick any they don't want included, then
batch-send by email, SMS, or print. Plus an optional recurring *reminder*
(never an unattended auto-send — the user explicitly chose that: a human
always reviews and ticks/unticks before anything goes out).

**New page** `app/(dashboard)/statements/page.tsx` + `client.tsx` — reuses
the exact tick/untick + `Dropdown`/`DropdownItem` batch-action pattern
already established by `jobs-list-table.tsx`/`invoices-list-table.tsx`.
Shows an aging breakdown per customer (Current / 1-30 / 31-60 / 61+) and a
live selected-total. Nav link added to `sidebar.tsx` + `mobile-nav.tsx`
(hidden from staff, same treatment as Invoices).

**Math**: `lib/statement.ts` — `buildCustomerStatements()` groups a
company's live (non-void, non-draft) invoices by customer, drops anything
fully paid, and buckets the rest by days-overdue. Separate from
`lib/job-financials.ts` (per-job ceiling math, not per-customer aging).
Covered by a real runnable check, `scripts/check-statement.mjs` — void/draft
exclusion, paid-off exclusion, Postgres numeric-string coercion,
multi-customer grouping, and all four aging-bucket boundaries.

**PDF**: `components/pdf/statement-pdf.tsx` (react-pdf, styled to match
`invoice-pdf.tsx`) + shared `lib/pdf/render-statement.ts` renderer used by
both `/api/statements/[customerId]/pdf` (batch print, same
sequential-`window.open` pattern as the existing batch invoice/complete
print, since browsers pop-up-block anything past the first per gesture) and
`/api/email/statement` (same PDF attached to the email). No public
"view statement online" page was built — deliberate scope cut, statements
are itemized directly in the email body (new `statementEmailHtml()` in
`lib/email.ts`) plus the PDF attachment, rather than adding a new public
token/route surface. `lib/email.ts`'s `sendEmail()` and `lib/notify.ts`'s
`EmailPayload` both gained `attachments` support (base64, Resend's format) —
nobody else needed this before.

**SMS**: `/api/sms/statement` — states the total balance and invoice count,
points the customer at the email rather than trying to itemize in a text.

**Schedule**: `companies.statement_run_interval` / `statement_run_next`
(migration `20260806150000_statement_run_schedule.sql`), editable right on
the Statements page (no changes to the already-huge `settings/client.tsx`).
Reuses the interval vocabulary (`weekly`/`fortnightly`/`monthly`/`quarterly`)
and the `addInterval()` roll-forward helper already used by recurring
jobs/invoices/service reminders in `app/api/reminders/route.ts` — that
helper is now exported from `lib/datetime.ts` instead of living locally in
that one route file, so the Statements page can compute the same "next run"
date the cron will later compute. New "Statement run reminders" section in
`runReminders()`: finds companies whose `statement_run_next` is due, emails
owner/admins a nudge (customer count + total owing) if there's actually
something to report, and **always** rolls the date forward regardless of
send success — same "don't nag forever" rule as the other recurring
sections in that file.

**A live browser test caught a real bug that `tsc`/`eslint` both missed**:
`StatementPdf` initially had `'use client'` (copy-pasted from
`invoice-pdf.tsx`), which broke with "Attempted to call StatementPdf() from
the server but StatementPdf is on the client" — `invoice-pdf.tsx` legitimately
needs that directive because `print-invoice.tsx` also renders it client-side;
`StatementPdf` has no client consumer (server-only PDF generation was a
deliberate scope cut — see above), so Next.js's bundler represented it as an
unresolvable client-reference stub. Fixed by removing the directive. This
class of bug is invisible to both the type checker and linter — only
exercising the real route in a browser surfaced it.

**Verified live**, not just statically: spun up local Supabase (a stale
Docker volume from before the 2026-07-23 terms-acceptance migration caused
an unrelated `/dashboard`↔`/upgrade` redirect loop first — `supabase db
reset` fixed it, worth remembering if a fresh local session ever loops
between those two routes), seeded a throwaway company with invoices across
every aging bucket plus one void/draft/fully-paid each (to prove exclusion),
and clicked through the real UI: tick/untick totals, the Email/SMS/Print
batch actions (all three verified to reach their external-send call
correctly — `RESEND_API_KEY`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` were
deliberately blanked in `.env.local` for the duration of this test so
nothing actually emailed or texted a real number or spent real Twilio/Resend
credit; Print's R2 upload was left live since it's just internal storage,
matching how the existing invoice-PDF feature already behaves in
production), and the schedule save (confirmed `addInterval` math and DB
persistence). Also manually fired `/api/reminders` with the cron secret
against a backdated `statement_run_next` and confirmed the new section
finds the due company, attempts the nudge email, and rolls the date forward
even though the send was (deliberately) unconfigured. `.env.local` restored
to production values afterward, local Supabase stopped.

**Not built**: unattended automatic sending (explicitly rejected in favor of
reminder-only, see above) and a public "view statement online" page
(scope cut, see PDF section above) — revisit either if a customer actually
asks for self-serve statement access.

## Session 2026-08-05 (Claude, pt.4) — Reality-check pass on pt.2/pt.3 claims; found and fixed a real FY-boundary bug

Ran the Reality Checker agent against this doc's own recent claims (pt.2
financial features, pt.3 mobile audit) rather than trusting the self-report.
**pt.3 (mobile security audit) held up completely** — every fix, migration,
and check re-verified by independently reading the code and re-running
`check-map-escaping.mjs` / `check-sync-rules.mjs`, both pass.

**pt.2 was overstated**: it claimed `lib/job-financials.ts` /
`lib/financial-year.ts` were "covered by runnable checks" — no such check
existed anywhere in the repo (confirmed by repo-wide grep/glob). The math
read correctly by manual inspection and `tsc`/`eslint` were genuinely clean,
but "read for correctness" had been conflated with "has a passing test."

**Wrote the missing check**: `tradiee-app/scripts/check-job-financials.mjs`
(run: `node scripts/check-job-financials.mjs` from `tradiee-app/`) — void-
invoice exclusion, Postgres numeric-as-string coercion, quote-vs-actuals
total fallback, floor-at-zero, and NZ/AU financial-year boundary crossing
including the DST edge case.

**That DST edge case caught a real bug, not a hypothetical one.**
`zonedMidnightToUtc` in `lib/financial-year.ts` used a single-pass offset
correction: format a naive UTC guess through the target timezone, measure
the offset it reveals, correct once. That's wrong whenever the naive guess
itself lands on the far side of a same-day DST transition — NZ's
+12/+13h offset is large enough that a midnight guess formats to *midday*
local time, and on the rare years NZ's DST changeover (first Sunday of
April) falls exactly on 1 April, midday has already crossed the transition.
**Every FY-start instant computed for NZ in 2018, 2029, 2035, and 2040 was
off by exactly one hour** (1am NZDT instead of midnight) — which would have
silently shifted the customer/job "FYTD" financial-year window by an hour
in those specific years. Fixed at the root (the one shared function both
`customers/[id]` and `jobs/[id]` depend on, not patched per-caller) by
replacing the single correction pass with fixed-point iteration — re-measure
the offset at each improved estimate until it stops moving, which converges
in 2-3 passes for any real single-hour DST shift. Verified all four affected
years now round-trip to true local midnight via `Intl.DateTimeFormat`, and
`npx tsc --noEmit` stayed clean.

The underlying "not verified live" gap from pt.2 is **still open** — the new
check proves the math is internally consistent, it does not replace testing
against real seeded data in a browser (still in Action items above).

## Session 2026-08-05 (Claude, pt.3) — Mobile security audit + PowerSync publication migration drift

Third security-audit pass, covering `tradiee-mobile/` and the PowerSync sync
rules as an access-control boundary — explicitly flagged as uncovered at the
end of pt.1's audit. Full write-up in `COMPLIANCE_GAP_ANALYSIS.md` under
"Audit pass 3." Ran as a background agent in an isolated git worktree, then
independently re-verified and merged (diffs read in full, both new runnable
checks re-run from the main tree, claimed APIs confirmed to actually exist in
the installed packages) rather than taken on trust.

**[HIGH] Fixed — Supabase refresh token was mirrored into unencrypted
AsyncStorage.** `lib/supabase.ts` persisted the session in `expo-secure-store`
then copied the access *and refresh* token straight back out into
AsyncStorage so the background location task could authenticate — negating
SecureStore entirely. A refresh token there is a standing account-takeover
primitive readable from a device backup or `adb backup`. Root cause was a
misdiagnosis: SecureStore works fine in background tasks, the real failure is
an iOS Keychain read while the phone is *locked* (default `WHEN_UNLOCKED`,
and the background task runs exactly then). Fixed with
`keychainAccessible: AFTER_FIRST_UNLOCK` and the background task now uses the
app's one shared client instead of rebuilding a second one from hand-copied
tokens. Legacy key deleted once at startup for installs that already have it
on disk.

**[MEDIUM] Fixed — script injection into the job-map WebView.** Same
JSON-in-`<script>` bug class as the tenant-site JSON-LD XSS fixed in pt.1,
this time in `app/job-map.tsx`. Reachable by an anonymous visitor: job titles
aren't trusted input, and `tradiee-app`'s enquiries flow can seed a job title
from the public, unauthenticated booking widget. Fixed with the same
`\uXXXX`-escaping approach; covered by a new runnable check
(`tradiee-mobile/scripts/check-map-escaping.mjs`) that extracts the shipped
helper from source at runtime so it can't drift from what's actually shipped.

**[MEDIUM] Fixed — offline PowerSync replica survived sign-out.**
`tradelogix.db` (unencrypted, `enableSQLCipher:false`) held the whole synced
dataset — customers, site access notes, pay rates, invoices — and neither
`auth.signOut()` nor the old `db.disconnect()` cleanup ever cleared it. Now
wiped via `db.disconnectAndClear()` in the `onAuthStateChange` handler
(covers a revoked/expired session too). Also set `android.allowBackup:false`
so Auto Backup doesn't copy the same unencrypted store to Google Drive. This
*bounds* the "local replica is unencrypted" gap, doesn't close it — see Open
follow-ups.

**[MEDIUM] Fixed — stale, non-role-aware sync rules, and the admin UI was
telling operators to deploy them.** `powersync-sync-rules.yaml` scoped every
query to company-only with zero role check — pasting it would have handed
every staff device the whole company's timesheets (incl. `bill_rate`/
`cost_rate`) and job material costs, all of which migration 031 makes
owner/admin-only. `tradiee-app/app/admin/settings/page.tsx` named this exact
file for operators to paste into the PowerSync dashboard. Deleted the stale
file, fixed the one-line reference, and added `scripts/check-sync-rules.mjs`
(runs from repo root) to make the invariant enforceable going forward: every
query must be `auth.user_id()`-scoped, every company-wide join must be
role-gated, and every table `sync-rules.yaml` references must actually be in
the `powersync` publication.

**Correction I made to the audit pass's own finding, before accepting it:**
its publication-drift assertion failed and was reported as "still open" —
before taking that at face value I queried `pg_publication_tables` on the
live database directly. **Production already had all the tables correctly
published**, matching the 2026-08-02 fix — this was never an active outage.
The real, narrower gap: that fix landed as a standalone script
(`supabase/powersync-publication.sql`), never folded into a tracked
migration, so a fresh environment or disaster-recovery restore via
`supabase db push` alone would silently reproduce the exact publication gap
that caused the 2026-08-02 outage. Closed with migration
`20260805130000_powersync_publication_full_table_list.sql` (applied to
remote, confirmed as a no-op as expected). Also fixed
`check-sync-rules.mjs`'s publication-drift assertion itself, which only
parsed migration 022 in isolation and would have kept failing forever even
with the new migration present.

Verified: `npx tsc --noEmit` clean on both apps (re-run independently after
merge, not just inside the worktree); both new runnable checks pass
(`node scripts/check-sync-rules.mjs`, `node tradiee-mobile/scripts/check-map-escaping.mjs`).
**Nothing exercised on a real device or simulator** — the Keychain-while-
locked behaviour, the sign-out wipe, and the WebView render all need hardware
to confirm.

**Still open** (also in Action items / Open follow-ups above): mobile has no
MFA challenge screen at all (web enforces TOTP `aal2` on `/admin`, mobile
doesn't have an equivalent path); local replica is still plaintext at rest
while a session is active (bounded by the backup opt-out, not closed); the
job-map WebView still loads Leaflet from unpkg + OSM tiles (supply-chain
hygiene, not a known exploit).

## Session 2026-08-05 (Claude, pt.2) — Customer/job financial visibility, batch invoice/complete actions

**Customer detail page**: new stat strip across the top — To Invoice,
Invoiced, Paid, Outstanding, Total FYTD. Financial-year boundary is NZ (1 Apr)
vs AU (1 Jul), computed timezone-aware (`lib/financial-year.ts`) against the
viewing user's own `profiles.timezone`, correctly handling NZ/AU DST (1 April
is still daylight time some years). "To invoice" sums each job's own ceiling
(the linked quote's total if it has one; a time-and-materials job with no
quote has no independent ceiling and reads $0 rather than a guessed number)
minus what's already invoiced against it, floored at 0.

**Job detail page**: same 5-metric box (Job total / Invoiced / To invoice /
Paid / Outstanding), right-aligned near the top. Sits *alongside* the
existing "Job Costing" card further down rather than replacing it — that
card answers a different question (profitability vs. quote estimate) and
excludes void invoices differently; touching it risked changing numbers its
existing users already rely on.

Both boxes' math lives in `lib/job-financials.ts` / `lib/financial-year.ts`,
covered by runnable checks (DST-crossing FY boundaries on both sides of the
line, void-invoice exclusion, Postgres numeric-as-string coercion, the
quote-vs-actuals total fallback, floor-at-zero).

**Batch actions**: tick jobs on the jobs list → **Batch Invoice** / +SMS /
+Email / +Print (new `components/jobs/jobs-list-table.tsx`,
`lib/batch-invoice.ts`); tick invoices on the invoices list → **Batch
Complete** / +SMS / +Email / +Print (`components/invoices/invoices-list-table.tsx`,
`lib/batch-complete-invoice.ts`). Batch invoicing is deliberately a simpler
subset of the single-job "Invoice from quote/actuals" flow — it skips
variations, partial-invoice trimming, and progress claims (genuinely
per-job judgment calls a batch action with no per-job dialog can't make) and
skips any job that already has a non-void invoice rather than guessing which
one was meant, reporting what was skipped and why. Batch complete only flips
drafts (mirrors the single-invoice "Complete invoice" button). Invoice
numbering for the batch is handled by the existing atomic per-company counter
trigger (`20260716120000_unique_doc_numbers.sql`), which overrides any
client-supplied number — no new race risk from creating several invoices in
one action.

Verified: `tsc --noEmit` and `eslint` clean across every touched/new file.
**Correction (see pt.4 below): this originally claimed the two math-heavy
modules "have passing runnable checks" — that check did not actually exist.**
One was written and passing as of pt.4, and it caught a real DST bug in the
process. **Not verified live** — no local Supabase running that session, so
none of this was exercised against real seeded data in a browser. Flagged in
Action items above; test before relying on it.

## Session 2026-08-05 (Claude, pt.1) & 2026-08-04 (Claude, pt.2) — Security audit pass 2: web app + marketing site

Full write-up in `COMPLIANCE_GAP_ANALYSIS.md` under "Audit pass 2," appended
to the 2026-07-07 doc. Two real findings, both fixed and applied to remote:

**[HIGH] Fixed — stored XSS on the app origin via public-site JSON-LD.**
`buildJsonLd()`'s output went through plain `JSON.stringify` into
`dangerouslySetInnerHTML` inside a `<script>` block — doesn't escape `<`, so
any tenant-editable field (company name, FAQ, service descriptions) could
break out of the tag. Worse than tenant-subdomain-only: the published site
also renders at `app.industryforms.app/site/<slug>` (the builder's own
Preview button links there), the same origin as the dashboard, and
`@supabase/ssr` sets session cookies `httpOnly:false`. Fixed with
`serializeJsonLd()` in `lib/website-seo.ts` (escapes `<`, `>`, `&`,
U+2028/2029 as `\uXXXX`, round-trips losslessly) — covered by a runnable
check. The same raw-interpolation pattern was also found (not yet exploited,
since all inputs were hand-authored) in the marketing-site page generators
written the same session — fixed there too with matching `escHtml()`/
`escJsonLd()` helpers in `scripts/build-blog-pages.mjs` /
`scripts/build-trade-pages.mjs`.

**[MEDIUM] Fixed — any company member could rewrite and publish the public
site.** `company_websites` insert/update RLS only checked `company_id`, no
role — a `staff` user could rewrite the site and, since `is_published` is
just a column, flip it live, bypassing the $19/mo add-on paywall that was
only enforced by the builder UI hiding a button. Migration
`20260804140000_restrict_website_writes_to_admins.sql` locks writes to
owner/admin (applied to remote), plus a matching page-level redirect.

Also this session: the marketing static site had **zero security headers** —
added a Cloudflare Pages `_headers` file (CSP, X-Frame-Options, nosniff,
referrer-policy). Confirmed the self-hosted `lucide.min.js` bundle hashes
byte-identical to the live CDN copy (no tampering) before trusting it.

## Session 2026-08-04 (Claude, pt.1) — Marketing site: SEO/UX/trust/performance overhaul

Full review-and-fix pass across the marketing static site (`index.html`,
`blog.html`, `privacy.html`, `terms.html`, root-level, separate from the
tenant Instant Websites). 12 items, all committed:

1. **Removed fabricated testimonials** — "Trusted by trades" quotes attributed
   to named companies that don't exist as customers; real FTA(NZ)/ACL(AU)
   exposure.
2. **Fixed App Store/Google Play badge honesty** — App Store visibly claimed
   availability (iOS isn't submitted); Google Play linked to `/signup`
   instead of the real `com.industryforms` listing.
3. **Fixed FAQ JSON-LD** to match the visible FAQ text exactly (was
   completely different questions — violates Google's structured-data
   policy).
4. **FAQ accordion → native `<details>/<summary>`** (was plain buttons with
   no `aria-expanded`), plus `© 2025 → © 2026` in all four footers.
5. **Wired up Umami analytics** (the site had zero tracking before this).
6. **Split the 13 blog articles** crammed as anchors in one `blog.html` into
   real pages (`blog/<slug>.html`), each with its own metadata + BlogPosting/
   BreadcrumbList JSON-LD. `blog.html` is now a pure index. Generated by
   `scripts/build-blog-pages.mjs` (data-driven, output committed, no build
   step exists in this repo).
7. **Built the 8 trade landing pages** (`trades/<slug>.html`) the footer
   already linked to but didn't exist — generated by
   `scripts/build-trade-pages.mjs`.
8. **Fixed pricing schema** (single `Offer` → `AggregateOffer` for the 3
   tiers), the **28-vs-30-day trial mismatch** across web/mobile signup +
   settings (the dashboard trial banner had a real bug: hardcoded "30 days
   remaining" regardless of the actual date), and added **real product
   screenshots** to the homepage (previously just a CSS mockup).
9. **Fixed the reveal-animation fail-closed risk** — the `<h1>` and 39 other
   elements were `opacity:0` by default, only shown once an
   IntersectionObserver fired; if JS never ran (disabled, blocked, a failed
   upstream script) the page stayed blank forever. Now gated behind an
   `html.js` class set by an early synchronous inline script, so no-JS means
   nothing is ever hidden. Added `prefers-reduced-motion` support (grain
   texture, orbs, reveal transitions had no way to pause — WCAG 2.2.2).
10. **Self-hosted fonts and icons** — replaced Google Fonts + unpkg/lucide
    CDN dependencies with locally-hosted `fonts/{figtree,sora}.woff2` +
    `js/lucide.min.js` (exact same bytes, hash-verified against the live
    CDN). `privacy.html`/`terms.html` additionally dropped the Tailwind CDN
    *runtime compiler* entirely (worse than the other CDNs — zero styling at
    all if blocked) after verifying 100/102 of their utility classes were
    already in the static `styles.css` build; the 2 gaps patched by hand.
11. Added a skip-to-content link (missing everywhere).
12. Added a "Talk to us" contact path for the Pro-tier buyer (every CTA was
    "Start Free Trial," fine for Solo self-serve, not for a 25-seat buyer who
    wants a conversation first).

Also this session (separate from the marketing pass): **added a FAQ section
type** to the Instant Website builder (`WebsiteSection` variant, all 3 site
styles, `FAQPage` JSON-LD, `llms.txt` entries) — closes the "Website FAQ
section" item that had been sitting in Open follow-ups. And **locked invoice
line items** once an invoice leaves draft status — items could previously be
added (web) or added/removed (mobile) on a sent/paid invoice; now matches the
existing draft-only delete restriction, enforced at the RLS layer too
(`20260804120000_lock_invoice_line_items_to_draft.sql`, applied to remote).

## Session 2026-08-02 (Claude) — ⚠ PowerSync publication gap after the Sydney migration

**Symptom**: invoices created on mobile showed "Invoice not found" (later an
endless "Syncing invoice…"), while the same invoice appeared fine on web. Jobs
synced normally, so PowerSync looked healthy.

**Root cause**: the `powersync` **Postgres publication** on the new Sydney
project was recreated with only 18 of the 23 tables the sync rules reference.
**`profiles` was missing.** Every `admin_company` stream query JOINs `profiles`
for the `role = 'owner' OR 'admin'` check, so with `profiles` unpublished the
whole stream silently returned nothing — invoices, quotes, customers,
enquiries, customer_messages all stopped syncing to mobile. `staff_jobs` kept
working because it joins `job_assignees` (published) and has no role check,
which is why *jobs* still synced and masked the real fault.

**Fix — TWO steps, and the second is the one that's easy to miss:**
1. Added `profiles`, `enquiries`, `customer_messages`, `projects`,
   `project_stages` to the publication (18 → 23 tables). **This alone did not
   fix it.**
2. **Adding a table to a publication does NOT backfill its existing rows** —
   logical replication only streams changes from that point on, so PowerSync
   held an *empty* copy of `profiles` and the JOIN still matched nothing. Forced
   the rows into the WAL with a no-op `update profiles set id = id`, run with
   `session_replication_role = 'replica'` so the `updated_at` triggers didn't
   falsely bump timestamps (verified: 0 rows had `updated_at` changed).
   **Confirmed working** — customers, quotes and invoices now sync to mobile.

**Diagnostic trap worth remembering**: invoices started appearing on mobile
*before* the real fix, which looked like success. That was only the Supabase
fallback on the invoice detail screen. **Customers/quotes were the honest
signal** because they have no fallback. When checking whether sync is alive, use
a screen with no fallback — e.g. the invoices *list*, not a single invoice.

**⚠ This will recur on any future Supabase project move.** The publication is
database-level state and is NOT recreated by `supabase db push`. New checked-in
script **`supabase/powersync-publication.sql`** is idempotent, adds any missing
table **and backfills only the ones it just added**. Run it after any
migration/restore. Its table list is derived from `sync-rules.yaml` and must be
updated when those rules change. Note the list includes tables that only appear
in a **JOIN** (e.g. `profiles`), not just those in a `SELECT` — exactly the class
of table that was missed.

Also this session (all pushed, `tsc` clean, OTA `c25b4450` published):
- **Invoice screen now falls back to reading from Supabase** when the row isn't
  in the local PowerSync DB, instead of spinning forever. Kept as
  belt-and-braces after the publication fix — it makes that screen resilient to
  this whole class of failure. Deliberately NOT extended to other screens.
- **Labour/sundries can no longer be added as job materials** (neither picker
  filtered by `type`, so a PO raised from the job would try to order labour from
  a supplier). Web + mobile pickers now exclude `labour`/`misc`, the mobile
  PowerSync schema maps the `type` column so it can filter, and PO generation
  filters defensively for rows created before the fix.
- Two extra tables (`companies`, `job_statuses`) were briefly added to the
  publication before I confirmed the sync rules don't reference them. Harmless
  (unused tables just add a little WAL overhead) and left in place; the script's
  list is the accurate 23.

## Session 2026-07-26 (Claude) — Supabase migrated Singapore → Sydney

Moved the database from `cfltbpwrojtlpkjvresd` (ap-southeast-1, Singapore) to
**`quidcdrnzjwarrqdpyao` (ap-southeast-2, Sydney)** to cut round-trip latency for
NZ/AU users. Test data only, so no maintenance window was needed.

**What was migrated** — schema via `supabase db push` (all 83 migrations applied
clean), then data via `pg_dump`/`psql` (Docker, since no local Postgres tools).
Storage schema was **excluded**: 2 bucket rows, **0 objects** (files live in
Cloudflare R2), and the buckets already existed on Sydney from the migrations.
**Reconciled 87/87 tables, 1597 rows expected = 1597 loaded.** Verified after:
6 auth users with password hashes intact (so existing passwords still work),
6 profiles all linked to auth users, 0 orphans, RLS enabled on all 65 public
tables, and real data served over REST with both anon and service-role keys.

**Two gotchas worth remembering:**
1. **New Supabase projects reject IPv4 on the `db.<ref>.supabase.co` direct
   host** — you must use the pooler (`postgres.<ref>@aws-0-ap-southeast-2.pooler.supabase.com:5432`).
   The direct host answers and then fails auth, which looks exactly like a wrong
   password. `supabase link` fetches the correct pooler URL from the API.
2. **A `$` in the DB password gets shell-expanded** when sourcing an env file —
   `.migration.env` values are now single-quoted. Symptom is identical to a wrong
   password. Verify credentials by reading the file with Python, not bash.

**Config updated**: `tradiee-app/.env.local` (URL + publishable + secret key;
backup at `.env.local.bak-presydney`) and `tradiee-mobile/eas.json` (both build
profiles). Dumps are in `.migration-work/` (gitignored — contains auth password
hashes; delete once Sydney is confirmed good).

**⚠ Still outstanding (dashboard/CLI actions, not code):**
- **Vercel** env vars + redeploy — until then production web still uses Singapore.
- **PowerSync** — repoint Postgres connection at Sydney (direct/pooler, needs
  replication rights) and set JWKS to
  `https://quidcdrnzjwarrqdpyao.supabase.co/auth/v1/.well-known/jwks.json`.
  Until done, mobile sync is still bound to Singapore.
- **Mobile OTA** (`eas update --branch production`) so installed apps repoint;
  the committed `eas.json` only affects *new* builds.
- **Do not delete the Singapore project** until all of the above are verified.

## Session 2026-07-24 (Claude) — Google Play compliance: privacy policy + background-location prominent disclosure

**Play rejection (Missing Prominent Disclosure)**: Google rejected the app —
`BACKGROUND_LOCATION` was requested with no in-app prominent disclosure (the OS
prompt + privacy policy alone don't satisfy the User Data policy). Fixed:
- New `tradiee-mobile/components/LocationDisclosureModal.tsx` — in-app modal
  naming the data (location, **"even when the app is closed or not in use"**),
  purpose (vehicle logbook + job map), with an affirmative **Allow** / Not now.
- `lib/location/tracking.ts`: `requestPermissions()` now **hard-refuses**
  background location until a stored consent flag (`LOCATION_DISCLOSURE_KEY`) is
  set — so neither the manual toggle nor the trading-hours auto-track path can
  reach the background request without the disclosure first. Helpers
  `hasLocationDisclosureConsent()` / `setLocationDisclosureConsent()`.
- `app/timesheets.tsx`: toggle and "save trading hours" both show the disclosure
  first (pending-action state resumes the right action on Allow).
- `tsc` clean. **User must `eas build --platform android --profile production`
  (versionCode auto-increments via `appVersionSource: remote` + `autoIncrement`),
  upload, and resubmit for review** — no appeal needed, this is the required fix.

**Privacy policy pass** (`tradiee-app/app/privacy/page.tsx`, deployed): added an
**AI Features** section (OpenAI/Anthropic, "not used to train their models"),
expanded payments for Tap to Pay/Stripe customer-card metadata, disclosed
**background** location, added photos/signatures + voice + named sub-processors.
Also produced a Data safety form reconciliation checklist for the user (not in
repo). Open item: privacy contact is `privacy@industryforms.co.nz` vs the
`industryforms.app` used elsewhere — flagged, not changed.

## Session 2026-07-23 (Claude, pt.3) — tidy job & invoice action buttons into dropdowns

Consolidated the sprawling, status-dependent action buttons on the job- and
invoice-detail screens into a small set of labelled dropdowns that stay put.
New reusable primitive `components/ui/dropdown.tsx` (`Dropdown` + `DropdownItem`,
outside-click/Esc close, `variant='primary'` green trigger, `align='right'`).

**Jobs** (`app/(dashboard)/jobs/[id]/client.tsx`, one row):
- **Schedule & Assign** ▾ — Schedule and assign / Schedule only / Assign only.
  Assign uses a **tickbox list of the team** (first ticked = primary
  `jobs.assigned_to`, the rest → `job_assignees`); reuses the existing
  job_assignees table. "Schedule and assign" opens a combined dialog.
- **Add** ▾ — Note / Time log / Worker (opens the assign tickboxes) /
  Subcontractor (drives the now-controllable `InviteSubcontractorModal`).
- **Print** ▾ — Print job / Create PDF (`PrintJobSheet` gained an `asMenuItems`
  mode; same for `PrintInvoice`).
- **Status** ▾ — every status as a click-to-set item (no dialog).
- **Invoice** ▾ (green, right-aligned) — Invoice from quote / Invoice from
  actuals (both **mark the job complete first**, preserving old "Complete &
  invoice") / Progress claim (reveals an inline % slider + amount, does NOT
  complete the job since it's mid-flight). Over-invoice `confirm()` safeguards
  kept. `PrintJobSheet` + `InviteSubcontractorModal` moved off `page.tsx` into
  the client (page now passes `sheetData`, `projectAddress`, `assignees`).

**Invoices** (`app/(dashboard)/invoices/[id]/client.tsx`, one row):
- **Add** ▾ — Line / Sundries / Discount / From job.
- **Print** ▾ — Print invoice / Create PDF.
- Record payment, Sync to Xero, Delete kept as **separate buttons** (user's
  call — payment is the primary payable action).
- **Complete Invoice** ▾ (green, right-aligned) — Complete invoice (mark sent) /
  Complete and email / **Complete and SMS** (per user: SMS moved here as a
  "Complete and…" option, not into Add). Only rendered when an option applies.
- **Revert back to job** moved out of the action row to sit **next to the
  prev/next arrows** on `page.tsx` (new `components/invoices/revert-to-job-button.tsx`).

No schema change (multi-worker already existed via `job_assignees`). `tsc`,
`eslint` clean on all touched files. **Not exercised in a running browser** this
session (needs local Supabase + auth + a seeded job/invoice) — static-verified
only; user is testing live after deploy.

## Session 2026-07-23 (Claude, pt.2) — 2-click "Order parts" (quote → per-supplier POs)

When a quote is accepted the tradie now has a one-flow way to order the parts.
**Root blocker found + fixed**: materials had no structured supplier link
(`price_list_items.supplier_name` was free text; quote lines can be ad-hoc with
no `price_list_item_id`), so there was nothing to group POs by.

- **Migration `20260723130000_po_from_quote.sql`** (✅ applied to remote via
  `supabase db push` 2026-07-23): adds `price_list_items.supplier_id` (FK) +
  `purchase_orders.quote_id` (FK) + indexes, and best-effort backfills
  `supplier_id` from any `supplier_name` that matches a supplier by name.
- **`POST /api/purchase-orders/from-quote`** — takes the quote's `material`
  line items, groups by each item's `supplier_id`, creates one DRAFT PO per
  supplier (materials with no supplier → one "unassigned" PO shown last),
  copies qty/unit_cost, links `job_id` (from `converted_to_job_id`) + `quote_id`.
  **Idempotent** (returns existing if any PO already tagged with this quote).
  po_number: passes distinct previews via `nextDocNumber` so it's correct
  whether or not the atomic-numbering trigger (migration 20260716120000) is live.
  Only `type = 'material'` lines are ordered (labour/service excluded; didn't
  widen the enum filter without confirming valid labels).
- **Review screen** `app/(dashboard)/purchase-orders/from-quote/[quoteId]` +
  `components/purchase-orders/order-parts-review.tsx` — the generated POs shown
  back-to-back, line items populated, each with an inline supplier picker for
  any unassigned PO and an edit link to the full PO builder. **"Send all"** loops
  the existing `POST /api/email/purchase-order` per PO. Assigning a supplier to
  an unassigned PO also backfills `supplier_id` onto those price-list items
  (only where null) — the system "learns", so the next quote is truly 2-click.
- **"Order parts" button** on the accepted-quote actions
  (`app/(dashboard)/quotes/[id]/client.tsx`, shows when `status === 'accepted'`)
  → POSTs from-quote → routes to the review screen. So the 2 clicks are:
  **Order parts** → **Send all orders**.
- **Price-list item editor** (`app/(dashboard)/price-list/client.tsx`): the
  free-text Supplier field is now a **dropdown** of supplier records (sets
  `supplier_id`, keeps `supplier_name` in sync for back-compat). `page.tsx`
  fetches suppliers; `lib/types.ts` `PriceListItem` gained `supplier_id`.

Reused the existing PurchaseOrderBuilder + email-PO route + draft PO status
end-to-end — no supplier ordering API (no NZ/AU merchant offers one to a small
SaaS; email PO is the real channel). `npx tsc --noEmit` clean. **Not exercised
against a live DB** (needs local Supabase + the migration + a seeded accepted
quote) — verify after `supabase db push`. No mobile involvement.

## Session 2026-07-23 (Claude) — Connect platform risk controls + ToS/MSA + Terms acceptance gate

User is completing Stripe's "negative balance liability" + "ongoing seller
compliance" acknowledgements (required because we're an Express + direct-charge
Connect platform, so **the platform is liable for connected-account negative
balances**). Advised on real-world risk and built the mitigations.

**Risk advice (non-code, for the user)**: the single biggest lever is the
Connect liability *config* — ask Stripe whether we can run a model where Stripe
/ the connected account bears loss liability (Standard accounts, or controller
`losses.payments = stripe`) instead of the platform; that dwarfs any ToS clause.
Also ask what reserve Stripe holds on the platform account. A ToS only gives a
*right to recover* from the tradie — worthless if they're insolvent/gone — so
the preventive controls below are the real shield.

**Three code controls (all `tsc`-clean, web + mobile):**
1. **Tap to Pay = paid subscribers only.** New `hasPaidPlan()` in
   `tradiee-app/lib/billing.ts` (super-admin / billing_exempt / `subscription_status
   === 'active'` — trial does NOT count; mirrors the existing `notOnFreeTrial`
   check). Enforced server-side in
   `app/api/stripe/terminal/payment-intent/route.ts` (403 before any
   PaymentIntent). Mobile mirrors it: `useCanTakePayments()` in
   `tradiee-mobile/lib/profile-context.tsx`, and the invoice-screen Tap to Pay
   button (`tradiee-mobile/app/invoices/[id].tsx`) is greyed out + shows a
   "Subscribe to use Tap to Pay" alert for trial users.
2. **Per-transaction + daily caps** in the same terminal route. Defaults
   $10k/charge, $25k/company/UTC-day; override via env `TAP_TO_PAY_MAX_SINGLE`
   / `TAP_TO_PAY_DAILY_CAP`. Daily total sums settled `payments` (method
   'stripe') today. Flat, not tiered — 0 connected accounts exist, tiers are
   premature (ponytail).
3. **Dispute detection**: `charge.dispute.created` case in
   `app/api/stripe/webhook/route.ts` → emails the operator
   (`PLATFORM_ALERT_EMAIL`, falls back to support@industryforms.app) + the
   merchant, logs to automation_events. Deliberately does NOT auto-freeze (a
   single dispute is often spurious; auto-actioning a legit tradie is its own
   unfair-contract risk). Escalation point is commented for later.

**Full ToS/MSA**: folded a complete **Section 4 (Payment Processing and
Merchant Services)** + a new mobile/app-store Section 6 into
`tradiee-app/app/terms/page.tsx` (single authoritative Terms, covers web +
mobile + payments). Covers Stripe-as-processor, Connected Account Agreement,
Tap to Pay/Apple terms, chargeback + negative-balance liability, indemnity,
recovery-of-funds, reserves/limits/holds, prohibited use, risk actions, seller
obligations. Wrote risk clauses **reasonable** (notice-where-practicable, "to
the extent permitted by law", preserves non-excludable CGA/ACL rights) rather
than the user's aggressive "sole discretion / debit any account" draft — that
raw wording is the most likely thing to be struck as an **unfair contract term**
in NZ/AU (AU has civil penalties since Nov 2023). Dropped the DIY bank-debit
promise (no mechanism; recovery routes through Stripe + right to pursue the
shortfall as a debt). **⚠ Still needs a NZ/AU commercial lawyer's UCT review
before it's relied on** — but per user's instruction it is NOT labelled a draft
anywhere; treat as live-pending-review.

**Terms acceptance gate** (user: "users must accept before using the
platform"):
- Migration `supabase/migrations/20260723120000_terms_acceptance.sql` adds
  `profiles.terms_accepted_at` + `terms_version`. **✅ applied to remote via
  `supabase db push` 2026-07-23** (required because `app/(dashboard)/layout.tsx`
  now `.select()`s `terms_version`).
- `lib/legal.ts` holds `CURRENT_TERMS_VERSION = '2026-07'` (bump when
  `/terms` changes materially → re-prompts users).
- Signup (`app/signup/page.tsx`) now has a required "I agree to the Terms /
  Privacy" checkbox; `app/api/auth/signup/route.ts` rejects without it and
  stamps `terms_accepted_at`/`terms_version` on the owner profile.
- Existing users: blocking overlay `components/legal/terms-gate.tsx` (no
  dismiss) renders in the dashboard when `terms_version !== CURRENT_TERMS_VERSION`
  (super-admins exempt so we can't lock ourselves out); "I agree" POSTs
  `app/api/legal/accept/route.ts` then `router.refresh()`.

Not exercised against a running build/DB this session (would need local
Supabase + the migration applied) — verified via `npx tsc --noEmit` clean on
both apps. No mobile rebuild yet: the greyed Tap to Pay button + acceptance
work ships in the next APK/OTA; the server-side paid gate + caps + dispute
webhook are web-side and live on deploy (after the migration).

**Carry-forward for next session**: (1) apply the terms migration to remote
before deploying; (2) get the ToS Section 4 lawyer-reviewed for NZ/AU UCT; (3)
settle the Connect loss-liability config with Stripe; (4) confirm
`STRIPE_WEBHOOK_SECRET_CONNECT` + optional `PLATFORM_ALERT_EMAIL` in Vercel or
disputes won't be received.

## Session 2026-07-20 (Claude) — website SEO/GEO/AEO/AIO layer

Added the structured-data + answer-engine layer the Instant Websites were
missing (they already had sitemap/robots/basic OG). New `lib/website-seo.ts`
holds shared helpers (`siteBaseUrl`, `schemaTypeForTrade`, `areaFromAddress`,
`siteDescription`, `buildJsonLd`), all auto-derived from the company profile +
site content:
- **JSON-LD** injected in `app/site/[slug]/page.tsx`: `LocalBusiness` typed by
  trade (Electrician/Plumber/RoofingContractor/HVACBusiness/HousePainter/
  Locksmith/GeneralContractor/HomeAndConstructionBusiness) with full NAP,
  PostalAddress, `areaServed` + `WebSite` + one `Service` per listed service.
  Only emitted for published sites (not owner drafts).
- **Metadata**: canonical, explicit robots (index for published / noindex for
  drafts, googleBot max-image-preview:large), keywords, `geo.region`/
  `geo.placename`, `og:locale` (en_NZ/en_AU), `og:image` prefers a hero photo
  over logo. `new URL(metadataBase)` is try/catch-guarded so a bad custom
  domain (or IP dev origin) can't 500 the page.
- **`app/site/[slug]/llms.txt/route.ts`** (new, llmstxt.org convention) — plain
  -text business summary for AI answer engines; same subdomain reverse-proxy
  handling as robots/sitemap.
- **sitemap.xml** now lists live booking-package pages (gated by the same
  bookings add-on check), drops fragment anchors, adds `<priority>`.
- Gallery/hero images: descriptive `alt` + `loading="lazy"` (threaded
  `businessName` through `SectionBlock` → each style's `Section`).

Verified end-to-end against a local sandbox (seeded published electrician site,
never touched production): JSON-LD graph, all head meta, llms.txt, sitemap,
robots all correct. Sandbox torn down, prod `.env.local` restored, seed deleted.

## Session 2026-07-20 (Claude) — 3 art-directed website styles replace the generic theme

The Instant Website builder previously only had a colour picker + sans/serif
toggle — every site rendered with the same generic gray-card layout. Modeled
3 fully art-directed styles on real trade-site references (Wix templates
wh-1052/1078/1324) and rebuilt the public-site renderer around them:
- **Bold & Direct** — high-contrast, CTA-heavy (dual header buttons, black
  pill CTAs, bordered service cards, floating white contact card).
- **Premium Editorial** — dark umber canvas, light serif type, ghost-outline
  buttons, hairline-divider service list, edge-to-edge photo grid.
- **Fresh & Organic** — sage + lime two-tone, rounded pill nav button,
  rounded photo/card treatment, signature lime accent block for
  contact/booking forms.

New `WebsiteStyle` field on `lib/website.ts`'s `WebsiteTheme`, defaulting to
`'bold'` via the existing `DEFAULT_THEME` merge — every already-published
site is upgraded automatically, no user action needed. `primary` (the
existing brand-colour picker) still drives buttons/links/accents within
whichever style is chosen. Dropped the now-dead sans/serif Font dropdown
(each style owns its own typography); added a 3-card Style picker with mini
palette swatches in `app/(dashboard)/website/client.tsx`'s Theme card.

Implementation: `app/site/[slug]/styles/{bold,editorial,fresh}.tsx` each
export `Header`/`Footer`/`Section` + `fontFamily`; `sections.tsx` dispatches
on `theme.style`. `ContactForm`/`BookingForm` gained a `variant`
(`'light' | 'dark'`) and `buttonCls` prop so editorial's dark canvas and
fresh's lime block get correctly-contrasted inputs instead of the default
white-card styling. Verified all 3 styles + both form variants end-to-end
against mock data via a throwaway `/style-preview` route (deleted before
commit) — never touched a real company or site.

## Session 2026-07-19 (Claude) — Help Guide, trial banner, embeddable booking widget, load test + bug fixes

**In-app Help Guide** — new bottom-right "Help" button opens a slide-in side
panel (`components/help/help-panel.tsx`) with two tabs: **Guide** (searchable
screen-by-screen walkthrough, `components/help/help-content.ts`, 21 web +
15 phone screens, auto-scrolls to the section matching the current route) and
**Ask AI** (the assistant that used to have its own separate floating button —
merged in, `components/ui/ai-assist.tsx` deleted). Added a **Feedback**
button next to the panel's close X (mailto to support@industryforms.app).
21 web screenshots + 13 phone screenshots added to `public/help/`, all
compressed to WebP (5.13 MB → 0.61 MB total). Two phone screens (Inbox, My
Profile) still show the placeholder — no clean screenshot existed. The
existing Stripe Tap-to-Pay onboarding guide is linked from the Settings
section entry.

**Free trial banner** — during an active trial, the header now shows a purple
`FREE TRIAL — N days left. Subscribe now` line left of the search box
(`components/layout/header.tsx`), hidden once paid or expired. New
`SubscriptionProvider` context (`components/providers/subscription-provider.tsx`,
mirrors the existing Timezone/CountryProvider pattern) feeds this to Header
without threading props through 40+ page files. Settings → Subscription also
gained a matching "Subscribe now" button that jumps to the plan grid. Login
page states "28 day Free Trial — No credit card required!" under the sign-up
link.

**Embeddable booking widget** — Bookings → Packages → **Embed** button reveals
a copy-paste `<iframe>` snippet so a tradie with an existing website can drop
the booking form straight into it, no code. `next.config.ts`'s app-wide
anti-framing headers (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`)
now exclude `/site/<slug>/book/<pkg>`, which gets `frame-ancestors *` instead —
scoped narrowly so the rest of the app (dashboard, login, public site root)
stays locked to same-origin framing. Payment can't be circumvented: the page
is still gated server-side by `hasAddon(company, 'bookings_website')`, so an
embed on an unsubscribed/lapsed account 404s (verified live). The iframe
auto-resizes to fit its content — new `EmbedAutoResize` component
(`app/site/[slug]/book/[packageId]/embed-resize.tsx`, only mounted in
`?embed=1` mode) posts the real content height to the parent via
`postMessage` on load/step-change/reflow (measuring the `#if-booking-root`
wrapper, not `documentElement`, which is clamped to the current iframe
viewport and can never shrink); the embed snippet includes a small
origin-validated listener that resizes the iframe. Verified end-to-end in a
genuinely cross-origin iframe (separate throwaway port): 720px fallback
correctly shrank to fit the slot picker, then tracked the taller details step.

**35-employee load test** — spun up local Supabase (Docker was down at
session start; `npx supabase start`), swapped `tradiee-app/.env.local` to
point at it (backed up first, restored after — **never touched production
data**), seeded 1 company / 35 staff (1 owner, 3 admin, 31 staff) / 18
customers / 70 jobs / 150 schedule visits via a throwaway Node script. Team
tab, job-assignment dropdown, Schedule week/list, Jobs board/list, and Job
Map all handled the volume fine — no truncation, no slow queries. Found and
fixed one real (not actually scale-specific, just caught here) bug: **Jobs
Board and Schedule week view both hydration-mismatched on every load** —
`@dnd-kit`'s internal `aria-describedby` id counter isn't deterministic
across server/client renders in Next.js. Fixed with the documented solution:
a stable `id` prop on both `DndContext` instances
(`app/(dashboard)/jobs/board.tsx`, `app/(dashboard)/schedule/client.tsx`).
Also found/fixed: **website builder's Preview button 404'd** — `/site/[slug]`
unconditionally blocked unpublished sites, but Preview links straight there
before first publish. Now the site's own owner/staff can preview a draft
(amber "Draft preview" banner), everyone else still gets a real 404
(verified: anonymous curl → 404, owner session → 200 + banner). All seed data
deleted, local Supabase stopped, `.env.local` restored from backup, backup
file removed — confirmed clean afterward.

## Session 2026-07-18 (Claude) — 7-item bug batch, invoice actions, email headers, Stripe payment fixes

**7-item bug batch** (user-reported list), root-caused:
1. **Signatures leaking into the website builder photo gallery** —
   `app/(dashboard)/website/page.tsx` pulled the last 60 `job_photos`
   company-wide with no filter; customer sign-off signatures (stored as
   `job_photos` rows, caption `'Customer sign-off'`, see
   `app/api/storage/signature/route.ts`) were selectable as public marketing
   images. Now excluded via `.or('caption.is.null,caption.neq.Customer sign-off')`.
2. **Form print sheet showed raw field ids instead of labels** —
   `components/ui/form-fill.tsx` `printSubmission()` now maps each answer key
   to the template field's label.
3. **Vehicle logbook logged 0.00km trips** — GPS speed noise could start a
   "trip" with no real movement. `tradiee-mobile/lib/location/tracking.ts`
   `endTrip()` now discards trips under 25m instead of inserting a
   `travel_logs` row.
4. **Mobile: no edit/delete on job materials** — `tradiee-mobile/app/jobs/[id].tsx`
   materials list now has tap-to-edit + a delete icon. `job_materials` has no
   `UPDATE` RLS policy (checked all migrations), so "edit" deletes + re-inserts,
   matching the web app's own delete-only pattern.
5. **Can't change a visit's scheduled time from the job page** — the
   `/schedule` page already had a full edit dialog + drag-and-drop; job detail
   only showed a read-only list. Extracted the dialog into a new
   `app/(dashboard)/jobs/[id]/visits-card.tsx` client component.
6. **No prev/next navigation** on job/quote/invoice detail pages — added
   `components/ui/prev-next-nav.tsx`, ordered by document number. Jobs reuses
   an already-fetched company job list; quotes/invoices each got one
   lightweight `id`-only query.
7. **Mobile manual time log only had a break-minutes field, no way to set
   actual hours** — `timesheets.tsx` `logTime()` hardcoded exactly
   `now - 1 hour` to `now`. Removed the bespoke modal/state and reused the
   existing `TimeEntryEditModal` (already had full date/start/end/break/notes
   editing for edits) in a new create mode — `EditableTimeEntry.id` is now
   `string | null`; `null` means insert instead of update. Also wired
   `companyId` into both call sites (`timesheets.tsx`, `jobs/[id].tsx`).

**Invoice actions relabeled + emailed indicator**: "Mark sent" →
"Complete invoice" (finalizes without emailing), "Send email" → "Complete and
send email" (the email API already set `status: 'sent'` server-side — label
now reflects that). New `invoices.emailed_at` column (migration
`20260717120000_invoice_emailed_at.sql`, **applied to remote**), set only by
`app/api/email/invoice/route.ts`, distinct from `sent_at` (which "Complete
invoice" also sets without emailing). Invoice detail page shows a green
"Emailed" badge + timestamp when set.

**Mobile: keyboard covered the job search box** in the allocate-trip bottom
sheet (Timesheets → Travel tab → allocate → "Work — assign to job"). Wrapped
the sheet in `KeyboardAvoidingView`, matching the pattern already used
elsewhere in `timesheets.tsx`.

**Stripe payment fixes** (two unrelated bugs, same session):
- **Web invoice pay page** (`app/i/[token]/pay-button.tsx`): `confirmPayment()`
  called `loadStripe()` a second time instead of reusing the instance that
  created the Elements — Stripe rejects this outright ("elements... created
  by a different Stripe instance"). Now stores and reuses the same `stripe`
  object alongside `elements`/`paymentEl` on `window`.
- **Mobile Tap to Pay** (`tradiee-mobile/app/pay-now.tsx`): `initialize()`
  calls the `tokenProvider` internally, but the native Stripe Terminal SDK
  swallows whatever our code threw on failure and replaces it with a generic
  "Couldn't fetch connection token. Please check your tokenProvider method" —
  hiding the real reason (most likely Stripe Connect payouts not finished for
  that company). Now preflights `fetchConnectionToken()` directly before
  calling `initialize()`, same pattern already used for
  `fetchTerminalLocationId()`, so our actual error message reaches the user.
- **Stripe Connect onboarding 500 with empty body** ("Failed to execute
  'json' on 'Response': Unexpected end of JSON input" on Settings → "Set up
  payouts"): `app/api/stripe/connect/onboard/route.ts`'s `startOnboarding()`
  called `ensureConnectedAccount`/`createOnboardingLink` (both hit the Stripe
  API) with no try/catch — an unhandled throw reached the client as an empty
  500 body. Now wrapped in try/catch, returns the real Stripe error message as
  JSON. **Not yet verified against a live failure** — next attempt should
  show the actual underlying Stripe error instead of the parse error.
- **Outstanding**: user asked why Klarna shows as a payment option on the web
  pay page — explained it's Stripe's automatic-payment-methods default
  (nothing enabled explicitly in code, `payment_method_types` isn't set in
  `app/api/stripe/payment-intent/route.ts`), offered to add
  `payment_method_types: ['card']` to drop it. Not yet actioned.

**Stripe Connect platform setup completed by the user** (dashboard.stripe.com/connect),
which surfaced two more real gaps:
- Stripe's dashboard no longer has one webhook endpoint with a "listen to
  connected accounts" checkbox — the user had to create **two separate
  webhook destinations** pointing at the same
  `/api/stripe/webhook` URL: one scoped "Your account" (subscription billing)
  and one scoped "Connected accounts" (payment_intent.succeeded/account.updated
  from direct-charge invoice/deposit/Tap-to-Pay payments). Each destination
  has its own signing secret, but the handler only checked one
  (`STRIPE_WEBHOOK_SECRET`) — the other destination's events would have
  silently failed signature verification. Fixed in
  `app/api/stripe/webhook/route.ts`: tries every configured secret
  (`STRIPE_WEBHOOK_SECRET`, new `STRIPE_WEBHOOK_SECRET_CONNECT`) until one
  verifies. **⚠️ `STRIPE_WEBHOOK_SECRET_CONNECT` (the connected-accounts
  destination's signing secret) needs to be added to Vercel env vars** —
  not yet confirmed done.
- Explained the end-to-end Tap to Pay payment flow to the user (job → invoice
  → Terminal Location → connection token → card_present PaymentIntent direct
  on the connected account → webhook marks invoice paid): all charges are
  **direct charges on the merchant's own connected account** (`connectOptions()`
  passes `{stripeAccount: company.stripe_account_id}`), no
  `application_fee_amount` anywhere, so funds settle straight to the
  merchant's bank on their own Stripe payout schedule — IndustryForms never
  touches the money, only finds out via the webhook.

**Email header: white banner instead of orange, across all templates** — the
`tapToPayLaunchEmailHtml` white-header fix (previous session) was
launch-email-only; every other template still had `background:#f97316`
headers where a logo could be unreadable. Fixed the shared `emailBrandHeader()`
helper in `lib/email.ts` (covers `brandedEmailHtml`, `reviewRequestEmailHtml`,
`bookingConfirmationEmailHtml`, `bookingRequestedEmailHtml`,
`reminderEmailHtml`) plus three more instances that had duplicated the header
markup inline instead of using the helper: `quoteEmailHtml`, `invoiceEmailHtml`
(now call `emailBrandHeader()` too), `lib/customer-portal.ts`, and
`app/api/invitations/send/route.ts` (subcontractor job invite). White
background + `1px solid #e5e7eb` bottom border; no-logo text fallback switched
from white-on-orange to dark-on-white (`#111827`). Verified by rendering
actual `quoteEmailHtml()` output in a browser (with and without a logo), not
just the diff.

**Two APK builds this session** (`eas build --platform android --profile
preview`, produces an APK per `eas.json`): first included the 7-item batch
through the manual-time-log fix
(https://expo.dev/accounts/grimstock/projects/industryforms/builds/cfac1ac4-123d-4996-9ebc-e984c2d10e05);
second added the keyboard fix + Tap to Pay error-message fix
(https://expo.dev/accounts/grimstock/projects/industryforms/builds/c1cc2b7d-959f-415e-bf12-afba4d52cc1c).
Neither build includes the Stripe Connect onboard fix (web-only) or is needed
for it.

All web/mobile changes verified with `npx tsc --noEmit` (clean on both apps)
and `npm run build` (web, clean). Docker/local Supabase was not running this
session, so nothing was exercised against live data beyond what's noted above
as browser-verified.

## Session 2026-07-16 (Claude, pt.3) — Tap to Pay hero image + launch email

- **Hero image placed**: Apple's official card-to-iPhone Marketing Toolkit
  visual now in the launch splash (`tradiee-mobile/assets/tap-to-pay-hero.png`,
  cropped + downscaled to 1000px transparent PNG). Splash in
  `app/(tabs)/_layout.tsx` uses it via a contained `<Image>` above the approved
  copy + Get started / Not now buttons. Ships via OTA (`eas update`) — it's a
  JS-referenced asset, no native rebuild needed for the splash itself.
- **Launch email built** (Apple req 6.1), mirroring the launch-push setup:
  - `tapToPayLaunchEmailHtml()` in `tradiee-app/lib/email.ts` — standalone
    IndustryForms-branded (NOT merchant-branded) announcement with Apple's exact
    approved copy, the hero, a "Get started" CTA → `${appUrl}/login`, and the
    mandatory Tap to Pay + Apple Pay legal disclaimers. Verified rendering in a
    browser preview.
  - Email hero hosted at `tradiee-app/public/tap-to-pay-hero.png` →
    `https://app.industryforms.app/tap-to-pay-hero.png` (white-flattened 640px,
    served by the same Vercel deploy — no Cloudflare dependency).
  - Super-admin endpoint `app/api/admin/tap-to-pay-launch-email/route.ts` sends
    once per eligible owner/admin, stamps `profiles.tap_to_pay_launch_email_at`
    (migration `20260716150000`, applied to remote), only stamps successful
    sends so failures retry, `{dryRun:true}` previews count. Does NOT auto-fire.
- **Go-live checklist for the user**: at launch, POST both
  `/api/admin/tap-to-pay-launch` (push) and `/api/admin/tap-to-pay-launch-email`
  as super-admin (try `{dryRun:true}` first). Optionally add the hero to the
  marketing site (www.industryforms.app, separate `site` git remote / Cloudflare
  Pages) and build a dedicated Tap to Pay product page for the email/marketing
  CTA to satisfy the guide's "link to your product page" preference (currently
  links to the app login).

## Session 2026-07-16 (Claude, pt.2) — invoice-delete lock + Apple Tap to Pay review-checklist compliance

**Invoice delete restricted to drafts**: delete was possible on any invoice
including sent/paid (audit-trail gap vs. the new unique-numbering). Now:
UI hides the trash button unless `status === 'draft'`
(`tradiee-app/app/(dashboard)/invoices/[id]/client.tsx`), the `deleteInvoice()`
handler guards on it, and RLS enforces it at the DB — migration
`20260716130000_restrict_invoice_delete_to_draft.sql` splits the old blanket
"admins write invoices" policy into insert/update/delete, with delete gated on
`status = 'draft'`. **Applied to remote.**

**Apple "Tap to Pay on iPhone — App Review Requirements Checklist" (v1.6)**:
user is submitting this to Apple. Reviewed the mobile Tap to Pay integration
(Stripe Terminal SDK, PSP = Stripe) against every row and built the fixable
gaps. Team ID `27Y63CNHB6`. Completed checklist saved to the user's Downloads
as both `.numbers` and `.xlsx` (Windows-editable). Code changes:
- **Receipt sending (req 5.10)**: "Send receipt" on the pay-now success screen
  via RN `Share` sheet (satisfies Apple's "Activity views" option).
- **Admin-only T&Cs acceptance (req 3.8/3.8.1)**: `pay-now.tsx` passes
  `tosAcceptancePermitted` only when profile role is owner/admin; staff get a
  "ask an owner/admin to enable it" message.
- **Merchant education (req 4.2/4.3/etc.)**: new `app/tap-to-pay-help.tsx`,
  shown once before first use (AsyncStorage-gated from both the More menu and
  the invoice Tap-to-Pay button) and permanently available as "Tap to Pay Help"
  in the More menu. Copy uses Apple's approved PIN / PIN-accessibility /
  no-recording wording from the Marketing Copy Block.
- **Config progress indicator (req 3.9.1)**: pay-now uses
  `onDidReportReaderSoftwareUpdateProgress` to show "Configuring Tap to Pay… X%".
- **Launch splash/hero (req 3.2/6.2)**: one-time full-screen `TapToPaySplash`
  modal in `app/(tabs)/_layout.tsx`, using Apple's exact approved value-prop
  copy (Marketing Guide Aug-2025 p.27 — do NOT edit, custom claims are
  forbidden). **STILL TODO: replace the placeholder card icon with Apple's
  "card to iPhone" hero image from the Marketing Toolkit asset pack (a separate
  download, not the guide PDFs); make "Terms apply." link to a full-disclaimer page.**
- **Launch push (req 6.3)**: super-admin endpoint
  `tradiee-app/app/api/admin/tap-to-pay-launch/route.ts` sends Apple's approved
  push copy to eligible owner/admin merchants once each (migration
  `20260716140000_tap_to_pay_launch_push.sql` adds `profiles.tap_to_pay_launch_push_at`,
  **applied to remote**). Does not auto-fire; `{dryRun:true}` previews the count.
  Push tap routes to `/pay-now` (handler added in `app/_layout.tsx`).
- **iOS deployment target + A12 (req 1.2/1.3)**: `app.json` now sets
  `expo-build-properties ios.deploymentTarget "16.4"` and
  `UIRequiredDeviceCapabilities ["arm64","iphone-ipad-minimum-performance-a12"]`.
  Takes effect on the next NATIVE build, not an OTA update.

**Outstanding for Apple submission** (not code / need a human): Marketing
Toolkit hero image + email template + product video (separate asset download);
confirm AU/NZ legal-disclaimer copy (the block the user had was the Singapore
version — value-prop copy is worldwide-identical, disclaimers differ); actually
send the launch email + push at go-live; record the New User Flow and Checkout
Flow videos (req rows 54/56); device-test the sub-1s button timing (5.6) and
<15-min onboarding (2.3); iOS <17.6 `osVersionNotSupported` handling (req 1.4)
still shows a generic error, not a specific "update iOS" message; FaceID/TouchID
login (1.7, Recommended) not built. Details in the completed checklist's
comments column.

## Session 2026-07-16 (Claude) — mobile forgot-password, admin set-password, and 8 bug-fix batch

**Forgot password**: mobile login screen now has a "Forgot password?" link
(`tradiee-mobile/app/login.tsx`) that calls `resetPasswordForEmail`, reusing
the web app's existing `/reset-password` page as the redirect target — no
deep-link plumbing needed.

**Admin "Set password" for team members** (web Settings → Team): user asked
for admin-viewable/eye-icon passwords that sync when a user self-resets —
declined that design since passwords are only ever stored as one-way hashes
(nothing to reveal) and a self-reset never reaches the server in plaintext
(nothing to sync). Built the secure alternative instead: new
`POST /api/auth/set-password` (`tradiee-app/app/api/auth/set-password/route.ts`,
same owner/admin + same-company guard as the invite route) lets an admin set
a member's password via `admin.updateUserById`; shown once in a toast so it
can be handed off, never stored. UI is in the edit-member dialog in
`tradiee-app/app/(dashboard)/settings/client.tsx`.

**8-item bug batch** (user-reported list), root-caused rather than
symptom-patched:
1. **Mobile photo upload "unsupported BodyInit type"** — RN `fetch` can't PUT
   a `{uri,name,type}` object as a raw body. Fixed by requesting `base64` from
   `expo-image-picker` and PUTing the decoded `Uint8Array.buffer` instead.
   `tradiee-mobile/app/jobs/[id].tsx`.
2. **Supplier-invoice upload needed a manual refresh** to show imported
   materials — `SupplierInvoiceParser` now calls `router.refresh()` after
   saving. `tradiee-app/components/ui/supplier-invoice-parser.tsx`.
3. **Invoice logo not appearing** — root cause was `@react-pdf/renderer`
   fetching the logo image cross-origin when rendered client-side (web
   Print/PDF buttons), which CORS silently drops; mobile's server PDF route
   had the same risk for non-PNG/JPEG logos. Fixed once with a shared helper,
   `tradiee-app/lib/pdf-logo.ts` (`logoDataUri`), that fetches the logo
   server-side and inlines it as a `sharp`-transcoded PNG data URI. Wired into
   `app/(dashboard)/invoices/[id]/page.tsx` and
   `app/api/invoices/[id]/pdf/route.ts`.
4. **Job/quote/invoice/PO numbers could be reused** after a delete — old
   `nextDocNumber()` was `count(*) + 1`, so deleting a row lets the next
   insert reuse its number (also race-prone under concurrent creates). Fixed
   at the DB level: new migration
   `supabase/migrations/20260716120000_unique_doc_numbers.sql` adds a
   `doc_counters` table + `next_doc_number()` (atomic, row-locking upsert) +
   a `BEFORE INSERT` trigger on quotes/invoices/jobs/purchase_orders that
   assigns the number server-side regardless of which app/client inserts.
   Counters are seeded from each company's existing max number. CSV import
   (`app/api/import/route.ts`) keeps its ability to preserve original invoice
   numbers via a new `import_invoice()` RPC that sets a skip-flag GUC before
   inserting (import previously computed its own job number by hand — that's
   now dead code, the trigger handles it). **`lib/numbering.ts`'s
   `nextDocNumber()` is now just a preview** (reads `doc_counters`) — the
   trigger is the source of truth.
   **⚠️ This migration has not been pushed to the live Supabase project yet
   — run `supabase db push` (or apply via CI) before relying on unique
   numbers.** Until then the old count-based behavior is still live in prod.
5. **AU addresses showing for NZ companies (and vice versa)** — address
   autocomplete hardcoded `countrycodes=nz,au`. Added a `CountryProvider`
   (`tradiee-app/components/providers/country-provider.tsx`, mirrors the
   existing `TimezoneProvider` pattern) wrapping the dashboard layout, reading
   `companies.country`; `AddressAutocomplete` now restricts suggestions to
   that country (`country` prop lets signup override before login). Mobile
   equivalent added to `lib/profile-context.tsx` (`useCountry()`) and
   `components/AddressAutocomplete.tsx`.
6. **Web quote builder had no inline "new customer"** (mobile quotes already
   did) — added the same inline-create pattern used by the jobs form
   (name/phone/email, dedupes by name) to `CustomerCombobox` in
   `tradiee-app/components/forms/quote-builder.tsx`.
7. **Completed jobs could still have materials edited** — mobile job detail
   now hides the "add material" box once the job reaches its terminal
   "completed" status; notes remain editable. Deliberately scoped to
   materials only, not the whole job (invoicing/photos after completion are
   normal). `tradiee-mobile/app/jobs/[id].tsx`.
8. **Paid invoices could still have line items added** — mobile invoice
   detail hides/guards "Add line" once `status === 'paid'`.
   `tradiee-mobile/app/invoices/[id].tsx`.

All TypeScript/ESLint clean on both apps. Not yet exercised in a running
build — user is testing on the next mobile build. **Outstanding for next
session**: push the numbering migration (`supabase db push`); consider
web-side (not just mobile) locks for items 7/8 if the user wants parity.

## Session 2026-07-14 (Codex) - production mobile builds/store submission attempt

User asked to build Android + iOS production builds and submit to stores after
the native Expo tab-bar rollback.

- **Prep/validation**: `npx.cmd tsc --noEmit` passed in `tradiee-mobile`.
  Added `tradiee-mobile/.easignore` so future EAS uploads do not try to ship
  `node_modules`, local native build caches, old logs, or credentials. Copied
  the Google Play service-account JSON into the path expected by `eas.json`
  (`tradiee-mobile/google-play-service-account.json`, gitignored).
- **EAS archive workaround**: direct builds from `tradiee-mobile` uploaded a
  700 MB archive because local ignored build folders were being swept in. Built
  from a clean temporary source export at
  `D:\TRADIEE\.eas-build-src\tradiee-mobile` (own tiny git repo, source only,
  local `node_modules` junction only for config-plugin resolution). Clean
  archive uploaded as 726 KB.
- **iOS production build succeeded**: build
  `d48f79d2-1778-43d0-b30d-8fa2b56f5bf9`, build number `7`, artifact
  `https://expo.dev/artifacts/eas/6wC3GKn4QdSvD4WrGlH7A2JoltBgT2wI75ZCqjxY00M.ipa`.
  iOS submit did **not** complete: `eas submit` needs `ascAppId`, and App Store
  Connect currently has no app record for `com.industryforms.app` (API lookup
  returned `[]`). The Developer Portal bundle ID does exist:
  `GK8S3YBZ82` / `com.industryforms.app`. Attempting to create the App Store
  Connect app record through the API key failed with 403 (`apps` resource does
  not allow `CREATE` for this key). **User must create the app record in App
  Store Connect** (name `IndustryForms`, bundle ID `com.industryforms.app`, SKU
  e.g. `industryforms-ios`), then add the returned numeric Apple app ID as
  `submit.production.ios.ascAppId` and run:
  `npx.cmd eas-cli submit --platform ios --id d48f79d2-1778-43d0-b30d-8fa2b56f5bf9 --profile production --non-interactive --wait`.
- **Android package-name correction for Google Play**: the Play Console app
  expects package name `com.industryforms`, while the first store AAB built
  this session used `com.industryforms.app`. Renaming the file does not change
  the embedded package, so that artifact will fail the Play Console upload
  check shown in App integrity. `tradiee-mobile/app.json` now keeps iOS on
  `com.industryforms.app` but sets Android to `com.industryforms`.
- **Corrected Android production build succeeded with the Google Play upload
  key**: build `2bb62bbd-414a-4ed2-8b48-c287195541f2`, versionCode `4`,
  production/store build for Android package `com.industryforms`, artifact
  `https://expo.dev/artifacts/eas/WTlxahpqvvp2pgkeMCOYikm712s9xRSOcA1RRRu18yU.aab`.
  Local copy:
  `tradiee-mobile/store-artifacts/industryforms-android-com.industryforms-v4-playkey.aab`.
  Verified with `bundletool` that the embedded package is
  `com.industryforms`, and verified with `keytool -printcert -jarfile` that
  the signing SHA1 is the Play-expected
  `68:7E:4B:D7:14:97:7E:C0:3D:E9:5A:BC:BF:4E:24:B3:FE:9B:C1:61`.
  This is the AAB to upload to the existing Google Play app.
- **Superseded corrected Android build**: build
  `a73c671c-c155-4309-ab13-72c1427fa63b`, versionCode `3`, artifact
  `https://expo.dev/artifacts/eas/ZQ_zM2mBm3ItR506-KCw9JuqwCY3F412RM0Jw5X5Qu8.aab`,
  had the correct package and signing key but Google Play reported
  versionCode `3` had already been used. Use versionCode `4` above instead.
- **Superseded corrected Android build**: build
  `e3fba176-594c-441a-8d50-f12b02bcff28`, versionCode `2`, artifact
  `https://expo.dev/artifacts/eas/RRhJ35hy6Glyxs5wFpledDkHurwC0IWkitDtF2SV5Ao.aab`,
  has the correct package `com.industryforms` but was signed with the newly
  generated EAS key SHA1
  `62:C5:84:16:A5:26:8D:58:3F:88:CE:76:7F:3C:A6:23:4D:91:B4:FC`; Google Play
  rejects it for the existing app.
- **Superseded Android production build**: build
  `3ea4b278-0ba8-4e71-b28b-9fbfe7c292b5`, versionCode `8`, artifact
  `https://expo.dev/artifacts/eas/QHyiFgeDcASj4JZU4mtrDVbQRHc81HxCh5LWWfH2LeM.aab`,
  is valid only for package `com.industryforms.app` and should not be uploaded
  to the current Play Console app expecting `com.industryforms`.
- **Android submit blocker**: fallback submit of older finished AAB
  `ebeddb6d-f332-410c-8018-a8709e71fcbd` (versionCode `4`, native-tab rollback
  commit) reached Google Play but failed because the **Google Play Android
  Developer API is disabled** for Google Cloud project `1016825408419`.
  Service-account attempt to enable `androidpublisher.googleapis.com` failed
  with `PERMISSION_DENIED`. User must enable:
  `https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview?project=1016825408419`,
  wait for propagation, then retry Android submit with the corrected package
  and corrected signing key build:
  `npx.cmd eas-cli submit --platform android --id 2bb62bbd-414a-4ed2-8b48-c287195541f2 --profile production --non-interactive --wait`.
- **Duplicate cleanup**: early 700 MB upload attempts spawned duplicate builds.
  Canceled Android `94f59dca-6f45-44e4-9299-cef1906dbb09`,
  `e0a14003-78ca-420a-ada2-7b3b1da267f2`,
  `d9a29e8b-9e43-4047-8e82-c37a44979414`; canceled iOS
  `c30b70ce-79f0-42b4-b680-e7c89eed085a` and
  `55ad208d-c38c-4f73-b52c-70ea19b39f79`. Extra finished iOS
  `60ede948-175a-4262-b574-41ee55b3842c` exists but was not submitted; keep
  `d48f79d2...` as the clean iOS artifact from this session.

## Session 2026-07-13 (Claude) — optimization pass + Tap to Pay verification

Worked a strategic optimization list; most of it was already built or was
config, not code. What actually landed (all `tsc`-clean; web on `main` →
Vercel prod, mobile in the next APK):

- **Supplier-invoice AI reconciler** — `app/api/supplier-invoice/parse/route.ts`
  now runs `arithmeticFault()` before accepting the fast `gpt-5.4-nano` parse
  and forces the `gpt-5.4-mini` re-parse on a fault. Two **confounder-safe**
  checks only (the parser strips GST + skips freight, so `sum(lines) < total`
  is normal — a naive "must balance" check would misfire on every invoice):
  (1) per-line `qty×unit_cost ≠ line_total`, (2) goods subtotal exceeding the
  grand total. Verified with 6 assert cases.
- **Kit "Split"** — kits can now be added as one **Bundle** line (existing) or
  **Split** into one editable, stock-tracked line per component. Web:
  `jobs/[id]/materials.tsx` + `invoices/[id]/client.tsx`. **Mobile: added kit
  support entirely** (`tradiee-mobile/app/jobs/[id].tsx`) — kits aren't in the
  PowerSync sync rules, so they're fetched **online** from Supabase (consistent
  with `addMaterial`, which already writes straight to Supabase). Bundle/Split
  picker + `consume_price_list_stock` + optimistic append.
- **Email failure visibility** — the two revenue sends (`app/api/email/quote`
  + `app/api/email/invoice`) now route through `notify()` so a failed send is
  logged to `automation_events` (visible in the admin failures report), not
  just returned as a 500. Bookings/reminders already used `notify()`.
- **NZD/AUD currency bug (root-cause, 3 places)** — every Stripe PaymentIntent
  hardcoded `currency: 'nzd'`, charging AU companies in NZD. Added
  `stripeCurrency(country)` in `lib/stripe.ts`; wired into terminal
  payment-intent, online invoice payment-intent, and booking deposit-intent
  (all now resolve `companies.country`).
- **Resend key** — user rotated the invalid `RESEND_API_KEY` in Doppler +
  Vercel; transactional email is live again.
- **Verified flagged bug-classes are contained** — the `gst_rate` vs
  `default_gst_rate` typo has zero remaining instances; every `is_terminal`
  reader falls back to `DEFAULT_JOB_STATUSES` (web + mobile). No lingering
  siblings.
- **Tap to Pay** — confirmed already fully wired (see the Tap to Pay entry
  below, corrected from its stale "install pending" text). Apple entitlement
  requested 2026-07-13, **granted 2026-07-14** — see the updated Tap to Pay
  entry further down for the now-unblocked iOS build path + both `eas build`
  commands. A fresh Android APK was also built same session to carry the
  mobile-kits change (separate from the EAS store build).

**Continued same session — EAS submit config, ClickSend, Stripe Connect
(both phases):**

- **`eas.json` Android submit config** — added `submit.production.android`
  (`serviceAccountKeyPath: ./google-play-service-account.json`, track
  `internal`). File itself is gitignored — **user must generate it** in Google
  Play Console → Setup → API access → create service account → download JSON
  → drop at `tradiee-mobile/google-play-service-account.json`. Not needed for
  `eas build`, only for automated `eas submit --platform android`.
- **SMS provider swapped Twilio → ClickSend, then reverted same day** — tried
  ClickSend for its advertised NZ/AU pricing, but a proper cost check showed
  it didn't actually beat Twilio, so reverted (see the revert entry further
  down this session log). Net effect on the codebase: **zero** — `lib/sms.ts`
  is back to Twilio's API and HMAC signature verification exactly as before,
  `smsConfigured()`/`toE164()` names unchanged throughout. The one thing that
  *did* stick from the detour is genuinely valuable and is documented in the
  SMS shared number pool entry below: the number-pool session-routing
  architecture and the cross-tenant collision fix it carries are provider-
  agnostic, so they carried straight over to Twilio rather than being thrown
  away with the ClickSend code.
- **Stripe Connect — Phase 1 (Express onboarding)**: migration
  `20260713100000_stripe_connect_accounts.sql` adds
  `companies.stripe_account_id` + `charges/payouts/details_submitted` flags.
  `lib/connect.ts` (`ensureConnectedAccount`, `createOnboardingLink`,
  `syncAccountStatus`), `POST /api/stripe/connect/onboard` (+ GET refresh
  redirect), `GET /api/stripe/connect/status`, webhook `account.updated` case.
  **`GetPaidCard`** (`components/settings/get-paid-card.tsx`) in Settings →
  Subscription — "Set up payouts" → Stripe hosted Express onboarding → returns
  to `?tab=subscription&connect=done`. Decisions locked in by user: **Express**
  now (Custom/white-label considered later), **no platform application fee**
  (monetise via subscriptions only). **User must**: apply the migration to
  cloud Supabase (`supabase db push` — not run from this session) and confirm
  Connect is enabled on the platform Stripe account before the card can
  actually onboard anyone (fails safe with 404 until then, no orphaned Stripe
  accounts created).
- **Stripe Connect — Phase 2 (money-flow flip)**: `connectOptions(company)` in
  `lib/stripe.ts` returns Stripe request options `{stripeAccount}` once a
  company's `charges_enabled` is true, else `undefined`. **Soft fallback** on
  the two customer-facing pay pages (`api/stripe/payment-intent` — online
  invoice pay, `api/bookings/deposit-intent` — booking deposits): direct charge
  once connected, platform-account charge (today's behaviour, unchanged) until
  then — so neither page ever breaks for a company that hasn't onboarded yet.
  **Hard gate** on Tap to Pay (`api/stripe/terminal/payment-intent`,
  `api/stripe/terminal/connection-token`): 409s with "Complete payouts setup…"
  if not connected, since a card-present charge has nowhere real to settle
  otherwise — this is a genuinely new requirement, not a regression (Tap to
  Pay hasn't shipped to real users yet). Tap to Pay direct charges also need
  the **Terminal Location to live on the connected account**, so it's now
  per-company (`ensureTerminalLocation()` in `lib/connect.ts`,
  `companies.stripe_terminal_location_id` via migration
  `20260713110000_stripe_terminal_location.sql`, new
  `GET /api/stripe/terminal/location` route) — **replaces** the old single
  global `EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID` env var, removed from
  `eas.json` and from `tradiee-mobile/lib/tap-to-pay.ts`
  (`fetchTerminalLocationId()` fetches it dynamically; `app/pay-now.tsx`
  calls it right before `connectReader`). Location's address is **best-effort**
  from the freeform `companies.address` text field (Stripe's Terminal Location
  API doesn't strictly require more than `country` at the type level; it will
  reject with a clear 400 if a given country needs more structure — surfaces
  to the caller, not a silent failure).
  **⚠ Critical, non-code, easy to miss**: the Stripe webhook endpoint
  (`app/api/stripe/webhook/route.ts`) **must have "Listen to events on
  connected accounts" enabled** (Dashboard → Developers → Webhooks → this
  endpoint) or `payment_intent.succeeded`/`account.updated` fired on a
  connected account (every direct-charge payment, once a company onboards)
  never reaches this handler — invoices would silently never get marked paid.
  Flagged prominently in a code comment at the top of that file too.
  Sequencing: per user's explicit "connect-first" call, this shipped **before**
  the app-store Tap to Pay submission, so Tap to Pay ships once on the correct
  per-tradie settlement model instead of needing a second mobile release to
  migrate off a platform-account version.
- Fresh Android release APK built same session carrying Phase 2 — see "Latest
  APK" line at the top of this file for its current build time/SHA256.
- **SMS shared number pool (session-routed)** — user proposed a shared-pool
  architecture (a handful of dedicated numbers serving all tenants, rotated
  via a session table) since dedicated-per-company numbers get expensive at
  scale; confirmed sound after review, one refinement applied, then built
  given the user's "100+ tenants, scaling fast" answer. Migration
  `20260713120000_sms_pool_sessions.sql`: `sms_pool_sessions` (company_id,
  customer_phone, pool_number, last_activity_at) — **sticky, no fixed TTL**
  (deliberate: a timer-based pool would let a number get reassigned to an
  unrelated tenant while the original customer still has it saved, so texting
  back after "expiry" would get evaluated against the wrong company; sticky-
  forever avoids that failure mode entirely — the refinement over the user's
  original TTL-based proposal). The real collision guard is the unique index
  on `(pool_number, customer_phone)`: the same customer phone can never be
  mapped to the same pool number by two different companies at once — a pool
  number still serves unlimited *different* customer phones concurrently.
  `lib/sms.ts`: `resolveOutboundFrom()` does sticky lookup-or-assign, picking
  a pool number not already tied to that exact customer phone by another
  company. Falls back to the single dedicated number when the pool env isn't
  set — **works unchanged today, pool activates once numbers are bought and
  the env is configured.**
  **Also fixed a real pre-existing bug while here**: the inbound webhook
  previously resolved the sending company via a bare cross-tenant
  `customers.phone` match (`.limit(1)`, no `company_id` filter at all) —
  `customers.phone` has no uniqueness constraint, so if two unrelated
  companies each had a customer record for the same phone number, an inbound
  reply could silently land in the wrong company's inbox. This was an
  unbounded, permanent risk (not a rare edge case) inherited from the
  original Twilio-era code, present regardless of pool or single-number mode.
  Now: company is resolved via `sms_pool_sessions(pool_number, customer_phone)`
  — the session created by the matching *outbound* send is the only source
  of truth for the tenant, so there's no ambiguous cross-tenant scan anymore.
  No session = genuinely unattributable (a cold text to a pool number with no
  prior outbound history) → a generic auto-reply ("This number is automated…"),
  no company guessed, no `customer_messages` row created. Legacy single-number
  mode (pool env unset) is untouched.
  Also fixed a bug this same change would have introduced:
  `app/api/sms/send/route.ts` used to hardcode `from_number` from a flat env
  var, which is unset in pool mode — `sendSms()` now returns the `from` it
  actually used so the thread history stays accurate.
  **This architecture is provider-agnostic** — built during the brief
  ClickSend detour below, it carried straight over to the Twilio revert with
  zero changes to its logic, only to which wire API `resolveOutboundFrom`'s
  chosen number gets sent through.
  **User must, when ready to activate the pool**: buy ~3 NZ + 3 AU dedicated
  Twilio numbers, set `TWILIO_POOL_NZ`/`TWILIO_POOL_AU` (comma-separated
  E.164), and point each number's "A MESSAGE COMES IN" webhook at
  `/api/sms/inbound`. Apply the migration to cloud Supabase before activating.

- **SMS provider reverted ClickSend → Twilio, same day (2026-07-13)** — a
  proper cost check showed ClickSend didn't actually beat Twilio's pricing
  once compared proportionately, so reverted. `lib/sms.ts` outbound send and
  the inbound/status webhooks are back to Twilio's Messages API and HMAC-SHA1
  `X-Twilio-Signature` verification (restored function verified against
  Twilio's own published test vector from their docs — not just "looks like
  before"). Env vars: `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
  `TWILIO_FROM_NUMBER` (single-number mode) or `TWILIO_POOL_NZ`/`TWILIO_POOL_AU`
  (pool mode, see the pool entry above) replace all `CLICKSEND_*` vars —
  **delete those, they do nothing now.** `TWILIO_OWNER_COMPANY_ID` (legacy
  single-number unmatched-sender fallback) was never renamed, still applies.
  Net effect: the codebase is back to exactly its pre-ClickSend Twilio shape,
  plus the pool/session architecture and cross-tenant collision fix — which
  is genuinely new and stayed, since it doesn't care which provider sends the
  wire request.

- **Mobile bottom nav rollback (same day)** - user reported the new custom
  persistent mobile bottom bar was not working and clarified they only want
  Expo's native tab bar. Rolled back the custom bar path: root
  `tradiee-mobile/app/_layout.tsx` no longer renders `BottomTabBar`,
  `tradiee-mobile/app/(tabs)/_layout.tsx` owns the visible native Expo
  `Tabs` bar again (`tabBarStyle: styles.tabBar`), and the custom-only
  `tradiee-mobile/components/BottomTabBar.tsx` plus
  `tradiee-mobile/lib/useNavStatus.ts` files were deleted. Verified with
  `npx.cmd tsc --noEmit` in `tradiee-mobile`. No APK has been rebuilt after
  this rollback yet, so the 2026-07-13 21:52 APK still contains the broken
  custom bar unless rebuilt.

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
(built 2026-07-13 21:52 NZT, 156,010,262 bytes, SHA256
`380576f6598b581530c7859eb430c2a83348978c3548af1a36b039b91ca2c9bc`). This build
still carries the now-reverted persistent bottom-nav-bar rework
(`components/BottomTabBar.tsx`) and the mobile quote-to-job conversion fixes
(explicit phone-user assignee, automatic material/labour/kit copy-over,
schedule-now-or-later prompt) on top of every prior mobile fix through commit
`87ef82e` — see `git log` for current commit hashes if this line goes stale.
The working tree has since been rolled back to Expo's native tab bar; rebuild
before distributing so the broken custom bar is not shipped. Build log:
`tradiee-mobile/release-build-navbar-quoteconvert.log` (`BUILD SUCCESSFUL`,
4m14s). **Not yet submitted to any store** — Android is build-ready
(`eas build --platform android --profile production`, EAS project linked,
credentials EAS-managed); Android *submit* needs the Play service-account
JSON dropped in first (see the eas.json entry in the session log above). iOS
build is now unblocked too — Apple granted the Tap to Pay entitlement
2026-07-14 (see the Tap to Pay entry further down for the build command +
one credentials-resync caveat).
The prior APK (2026-07-13 16:10 NZT, SHA256
`d64bd79c155da5405802346bd8bf617920bbe4e7f0a50a4db51db32b56e26c4a`, mobile-kits
change on commit `1dac35d`) is superseded. The `release-build-schedule-fix2.log`
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
- **Twilio (live — ClickSend tried and reverted same day 2026-07-13, see
  session log above)** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus
  **either** `TWILIO_FROM_NUMBER` (single dedicated number — simplest, fine
  below ~15-20 tenants) **or** `TWILIO_POOL_NZ`/`TWILIO_POOL_AU`
  (comma-separated E.164 lists — the shared-pool architecture built same
  session for scale, see above; ~3 NZ + 3 AU numbers). Point each number's "A
  MESSAGE COMES IN" webhook at `https://app.industryforms.app/api/sms/inbound`
  (POST) — **every** number if using the pool. Delete any lingering
  `CLICKSEND_*` vars, they do nothing now. SMS is dark (safe no-op) until this
  env is set.
- **Resend — fixed 2026-07-13** — the previously-invalid `RESEND_API_KEY` was
  rotated in Doppler + Vercel; transactional email is live again. `EMAIL_FROM`
  (verified sender domain) still needed either way. Quote/invoice send
  failures now also log to `automation_events` (admin-visible), not just a
  raw console warn — see the same session's email-failure-visibility entry.
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

**Tap to Pay** — **fully wired for iOS + Android**, now on **direct Stripe
Connect charges** (see the Stripe Connect Phase 1/2 entries in the 2026-07-13
session log above — this replaced the original single-tenant design).
Backend: `/api/stripe/terminal/connection-token` (creates the token on the
company's connected account) + `/api/stripe/terminal/location` (per-company
Terminal Location, `ensureTerminalLocation()`) +
`/api/stripe/terminal/payment-intent` (card_present, auto-capture, direct
charge). All three **hard-gate 409** if the company hasn't completed Connect
onboarding — Tap to Pay hasn't shipped to real users yet, so this is a new
requirement, not a regression. Mobile: SDK
`@stripe/stripe-terminal-react-native` (beta.31, supports `tapToPay`)
installed; config plugin + Location/NFC/foreground-service permissions in
`app.json`; `StripeTerminalProvider` + `tokenProvider` in `app/_layout.tsx`;
full discover→connect→collect→confirm flow in `app/pay-now.tsx` (Android
runtime-permission branch + iOS TOS auto-accept), now fetching the per-company
location via `fetchTerminalLocationId()` right before `connectReader` instead
of a static env var. The original single Terminal Location
`tml_Gjk2AE1e6OUFu2` ("Industry Forms NZ", Auckland, confirmed enabled on the
account with a livemode "Mobile Phone Reader" already connected) is now
superseded per-company infrastructure — kept only as evidence Tap to Pay is
enabled on the platform Stripe account; each company gets its own Location the
first time they take a card-present payment after connecting.
**Apple's `com.apple.developer.proximity-reader.payment.acceptance`
entitlement was GRANTED 2026-07-14** (requested 2026-07-13) — the only
remaining blocker is now just running the iOS build. Config plugin
(`@stripe/stripe-terminal-react-native`, `tapToPayCheck: true`) already
handles injecting the entitlement into the generated provisioning profile at
EAS prebuild time — no manual `app.json` entitlements edit needed. **Before
building**, confirm the capability shows as enabled on the `com.industryforms.app`
App ID in Apple Developer Portal (Certificates, IDs & Profiles → Identifiers);
if EAS's cached provisioning profile predates the grant, run
`cd tradiee-mobile && eas credentials` (iOS → production) to force it to
resync/regenerate before building, otherwise a stale profile could still lack
the capability.
Build commands (both run interactively — Apple/Google prompts, EAS build
queue):
```
cd tradiee-mobile
eas build --platform android --profile production   # no blockers, ready now
eas build --platform ios --profile production        # now unblocked by the entitlement grant
```
Both platforms are functionally gated on Stripe Connect onboarding too (see
above) — Tap to Pay 409s with "Complete payouts setup…" until a company
connects. Note: the entitlement is a **native capability, so it cannot be
shipped via OTA/EAS Update** — it required this fresh native build + App
Store review, which is now unblocked.

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
  Update 2026-07-11: auto-started job timers now surface a global in-app popup
  from the tab shell (`tradiee-mobile/app/(tabs)/_layout.tsx`) with the job
  number/title, an X dismiss action, a View Job action, and a "Don't track this
  time" action that removes or neutralises only that auto-created timesheet
  instance while leaving GPS auto-tracking enabled. The existing job detail
  screen still reads `TRADIEE_ACTIVE_JOB`, so the manual Stop Job Timer button
  appears when an auto-started timer is running. Verified with mobile
  `npx tsc --noEmit`.
- ~~Vehicle logbook movement capture~~ — **fixed 2026-07-11 by Codex.**
  Root cause: `tradiee-mobile/lib/location/tracking.ts` only processed the
  last location in each Expo background batch and only started trips from a
  reported GPS speed >= 15 km/h. Mobile OS background speed can be null/stale,
  and batched points can contain the actual route before the final point, so
  legitimate relocations could be missed. The task now processes every sample
  in timestamp order, keeps a per-session last-location anchor, starts/updates
  trips from distance deltas as well as speed, lowers the movement threshold,
  improves update cadence/accuracy, clears stale anchors when tracking stops,
  and uses the sample timestamp when closing a trip. Reality Checker found
  and Codex fixed follow-up reliability gaps: failed Supabase/auth saves no
  longer clear the active trip, stale/overlapping location batches are ignored
  instead of double-counted, manual/scheduled stop uses a newer high-quality
  end point or falls back to the trip's last movement point, and the Timesheets
  stop toggle keeps tracking on with an alert if the active trip cannot be
  saved. Verified with mobile `npx tsc --noEmit`; still needs a real device
  drive/stop smoke test because desktop builds cannot validate OS background
  GPS delivery.
  Crash-fix follow-up 2026-07-11: after the APK crash report, Codex added
  defensive parsing/removal for tracking/timer `AsyncStorage` values in the
  tab shell, Home, Timesheets, Job detail, and tracking task, plus a safe
  fallback icon component so a missing icon mapping cannot render `undefined`.
  Rebuilt release APK successfully (`release-build-crashfix.log`, 12:20 NZT).
- ~~Default job assignee + mobile creation/upload/icons fixes~~ — **done
  2026-07-11 by Codex.** Added company-level
  `default_job_assignee_id` (`20260710225010_default_job_assignee.sql`) and a
  Settings selector. Web and mobile new-job creation now preselect the default,
  prompt "Assign job to" when more than one active team member exists, and the
  mobile `/api/jobs` path validates assignees against the caller's company
  before inserting. Mobile new-job keyboard handling now scrolls focused fields
  above the keyboard; job photo upload no longer constructs a Blob from
  `ArrayBuffer`-backed data and instead PUTs the picked file body to the signed
  storage URL; mobile icons now use `lucide-react-native`/`react-native-svg`
  through `tradiee-mobile/lib/icons.tsx` instead of `@expo/vector-icons`.
  Verified with mobile `npx tsc --noEmit`, web `npx tsc --noEmit`, web scoped
  ESLint on changed files, and `npm run build` for the web app. Full web lint
  still has unrelated pre-existing lint errors in terms/invoice/AI-assist code,
  and Expo Doctor still reports existing app config/schema + quick-sqlite New
  Architecture metadata issues.
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
