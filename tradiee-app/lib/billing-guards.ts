// Split out from lib/billing.ts on purpose: that file must stay importable by
// plain `node scripts/check-*.mjs` (no bundler, no Next.js runtime), and
// `next/navigation` isn't resolvable outside one — importing it there broke
// every check script that pulls in billing.ts. This file is Server-Component-
// only.
import { redirect } from 'next/navigation'
import { effectivePlanKey, type BillingCompany } from './billing'

/**
 * Server-component page gate: redirects to /upgrade for a whole paid-only
 * section (purchase orders, bills, timesheets, bulk invoicing, vehicle
 * logbook, Xero...) the same all-or-nothing way as the Bookings/Xero pages.
 * No "keep grandfathered access to old data" nuance here, unlike the
 * jobs/customers/price-list-items row caps — those protect core workflow
 * data a downgrade shouldn't hide; these are whole optional modules, and
 * every existing paid-only page already redirects wholesale like this.
 * Caller must select `companies!company_id(subscription_plan,
 * subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until)`
 * on the profile query first.
 */
export function redirectIfFreePlan(company: BillingCompany | null): void {
  if (effectivePlanKey(company) === 'free') redirect('/upgrade')
}
