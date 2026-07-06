# IndustryForms — What's Outstanding (2026-07-06)

A founder-facing catch-up: what's built, what's broken, what needs *you*
specifically (not code). For full technical detail see `PROJECT_STATE.md` —
this doc is the short version.

## 🔴 Fix this first — email is silently broken

Every email the app sends (quotes, invoices, reminders, review requests,
booking confirmations) is failing right now. Not "unconfigured" — the Resend
API key is present but **Resend itself is rejecting it as invalid**. Nothing
crashes, nothing shows an error to your customers — the emails just never
arrive.

**What you need to do:** Log into Resend, check/rotate the API key, confirm
`EMAIL_FROM`'s sender domain is verified, and make sure the working key is
set in **Vercel → Project Settings → Environment Variables** (not just
locally). Then redeploy. Settings → Integrations in the app shows a live
green-tick/amber-warning status once it's fixed.

## What's actually live already (don't re-check these)

- **Stripe** — live, real payments/refunds tested successfully.
- **Twilio** — live, SMS sending works, inbound webhook signature-verified.
- **Anthropic** — live (SmartWrite, AI quote drafting, daily AI to-dos).
- **Supabase, R2 storage, PowerSync** — all live and working.

## Growth Engine (the last 5 sprints) — fully shipped

Unified inbox, bookings website add-on, bookable packages + availability
engine, the public booking widget with Stripe deposits, and automated
booking emails/reminders/reporting are all built, tested against real cloud
data, and on `main`. Nothing left to build here unless you want new features
beyond the original scope.

## Things only you can do

These aren't code problems — they need an account, a decision, or a
business call from you:

1. **Fix the Resend key** (above — this is the urgent one).
2. **Set the wildcard domain** `*.industryforms.app` in Vercel + your DNS
   provider, so every tenant's Instant Website gets a free subdomain
   (`theirname.industryforms.app`) without you doing anything per-customer.
3. **Cloudflare for SaaS** — set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID`
   in Vercel so customers can attach their *own* custom domain to their
   website (optional add-on feature; site works without it, just on your
   subdomain instead).
4. **Create the Stripe Price objects** for `website_monthly` ($9/mo) and
   `projects_monthly` ($19/mo) in the Stripe dashboard if they aren't there
   already — the checkout code expects them to exist by lookup key.
5. **Map Twilio numbers to companies** — right now there's one shared Twilio
   number and `TWILIO_OWNER_COMPANY_ID` (only in your local `.env.local`, not
   yet in Vercel) decides who "owns" unmatched inbound texts. Add that env
   var to Vercel now; a real per-company number mapping is a future project
   once you have more than one company using SMS.
6. **Decide if you want a Stripe-billed Projects add-on checkout** — right
   now `/api/billing/addon` just flips a flag directly (fine for you as
   super-admin, not fine for a self-serve customer). Low priority until
   you're selling Projects to outside customers.
7. **Google Business Profile API access** — the sync code is stubbed and
   waiting on Google approving API access; that's an application only you
   can submit.
8. **Apple's proximity-reader entitlement** — needed before Tap to Pay can
   go live on iPhone; another approval only you (as the account holder) can
   request.
9. **Two accounts to create when you're ready to go live**: an
   owner/super-admin account (`admin@industryforms.co.nz`, then flip
   `is_super_admin` in the DB) and an App Store review account
   (`test@industryforms.co.nz`, billing-exempt). Not created yet.
10. **EAS free plan** resets on a rolling basis — check before your next
    mobile build whether you're back on the free tier or still need the
    local Gradle build path.

## Known gaps that are safe to leave for now

- **SMS side of the new booking automations is code-complete but not
  smoke-tested against real Twilio** (deliberately avoided sending real test
  texts during dev). Do one real test — book a package with
  `booking_settings.confirmation_channel` set to `sms` or `both` — before
  relying on it for a live customer.
- **New signups get no custom `job_statuses` rows** — harmless (everything
  falls back to sensible defaults), but was the root cause of a real bug
  (win-back reminders silently never firing) until caught and patched. Worth
  seeding real rows on signup eventually so nothing has to remember the
  fallback exists.
- **Avg inbound response time** — can't be reported on; nothing in the
  database records when a lead first got replied to. Would need a new
  timestamp captured at first-response time if you want that metric later.
- **Reminder-cron sends aren't logged to the customer communications
  history** the way manual sends are (pre-existing, not part of this
  sprint's work).

## Backlog (no rush, in rough priority order)

- Marketing site at industryforms.app (separate from tenant Instant Websites)
- Configurable dashboard widgets
- Job-map geocode-on-save for new site addresses
- Tap to Pay finish (blocked on the Apple entitlement above)
- Google Calendar sync
- GPS geo-fence time clock (auto check-in on site arrival)
- Customer portal login (customers view their own job/invoice history)
- Per-customer-group pricing levels
- MYOB/QuickBooks sync (Xero already works)
- Standalone invoice templates
- Mobile Projects view (currently web-only by design)
- Spot-check remaining UI chips/pills for the per-route accent colour sweep
