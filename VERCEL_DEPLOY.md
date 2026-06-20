# Deploy the web app (tradiee-app) to Vercel

The repo is on GitHub, so connect it in the Vercel dashboard — that gives
auto-deploys on every push to `main`. `next build` already passes against the
cloud env, so the deploy should succeed once env vars are set.

## 1. Import the project
1. https://vercel.com/new → import **NZGrimstock/industryforms**.
2. ⚠️ **Root Directory** → set to **`tradiee-app`** (it's a monorepo; the Next.js app
   lives in that subfolder). Framework preset auto-detects as Next.js.
3. Leave build/output settings at defaults (`next build`).

## 2. Environment variables
Add these under Project → Settings → Environment Variables (Production + Preview).

### Required for core functionality
| Variable | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cfltbpwrojtlpkjvresd.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | public |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | **secret** |
| `R2_ACCOUNT_ID` | `2def11afa315cff05e64926573b3191f` | **secret** |
| `R2_PUBLIC_BUCKET` | `industry-forms-public` | public |
| `R2_PRIVATE_BUCKET` | `industry-forms` | public |
| `R2_PUBLIC_ACCESS_KEY_ID` | public-bucket token id | **secret** |
| `R2_PUBLIC_SECRET_ACCESS_KEY` | public-bucket token secret | **secret** |
| `R2_PRIVATE_ACCESS_KEY_ID` | private-bucket token id | **secret** |
| `R2_PRIVATE_SECRET_ACCESS_KEY` | private-bucket token secret | **secret** |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | `https://cdn.industryforms.app` | public |
| `NEXT_PUBLIC_APP_URL` | `https://app.industryforms.app` | public |
| `CRON_SECRET` | a long random string | **secret** |

### Optional (feature-gated — add when you enable each)
`NEXT_PUBLIC_POWERSYNC_URL` (offline sync), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` /
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (billing), `RESEND_API_KEY` /
`EMAIL_FROM` (email), `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` (Xero),
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (calendar), `ANTHROPIC_API_KEY` (AI parsing).

> Copy the real values from `tradiee-app/.env.local`. Mark every key labelled
> **secret** as "Sensitive" in Vercel.

## 3. Deploy
Click **Deploy**. First build runs `next build` in the `tradiee-app` root.

## 4. Post-deploy wiring
1. **Supabase Auth** → URL Configuration: set **Site URL** to your Vercel URL and add
   `<vercel-url>/auth/callback` to **Redirect URLs**.
2. **R2 CORS** (`industry-forms-public`): add your Vercel origin to `AllowedOrigins`
   (see `R2_SETUP.md`).
3. **Custom domain** (optional): add `app.industryforms.app` in Vercel → Domains, then
   set `NEXT_PUBLIC_APP_URL` to it and re-add it to the Supabase/R2 allowlists.
4. **Mobile**: set `tradiee-mobile/.env` → `EXPO_PUBLIC_API_URL=https://<your-vercel-url>`
   (HTTPS — fixes the cleartext-blocked photo uploads), then build Android.

## Notes
- Auto-deploys: every push to `main` triggers a Vercel build once connected.
- The `allowedDevOrigins` in `next.config.ts` is dev-only and irrelevant in production.
