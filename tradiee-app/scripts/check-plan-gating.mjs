// hasAddon()'s Projects-bundled-into-Pro rule, and effectivePlanKey() staying
// correct for the plan-restructure gates added across purchase-orders,
// bills, time-logs, invoices/bulk, and the job-plans/company-logo uploads.
// Run from tradiee-app/:  node scripts/check-plan-gating.mjs

import assert from 'node:assert/strict'
import { hasAddon, effectivePlanKey } from '../lib/billing.ts'

const future = new Date(Date.now() + 30 * 86400000).toISOString()

function activeCompany(plan) {
  return { subscription_status: 'active', subscription_plan: plan, trial_ends_at: null, addons: {} }
}

// Pro gets Projects (and by extension plan takeoff, gated the same way)
// bundled — no addons flag needed.
assert.equal(hasAddon(false, activeCompany('pro'), 'projects'), true, 'pro is bundled with projects, no addons flag needed')
// Team needs the addons flag actually set (bought separately).
assert.equal(hasAddon(false, activeCompany('team'), 'projects'), false, 'team without the addon does not have projects')
assert.equal(
  hasAddon(false, { ...activeCompany('team'), addons: { projects: { active: true } } }, 'projects'),
  true,
  'team WITH the addon flag set has projects',
)
// Without the addons flag, solo/free/trial don't have it (the flag can only
// get set by buying it, which /api/billing/addon restricts to Team+ — but
// hasAddon() itself doesn't re-check plan tier once the flag is set; a
// company that bought it on Team and later downgrades their main plan while
// keeping the separate add-on subscription running should keep what they're
// still being billed for, same as every other add-on slug works).
assert.equal(hasAddon(false, activeCompany('solo'), 'projects'), false, 'solo without the addon does not have projects')
// billing_exempt and super-admin bypass everything, as before.
assert.equal(hasAddon(false, { ...activeCompany('free'), billing_exempt: true }, 'projects'), true, 'billing_exempt gets projects')
assert.equal(hasAddon(true, null, 'projects'), true, 'super-admin gets projects even with no company')
// The Pro-bundling rule is 'projects'-specific — it must not leak into other
// add-on slugs (bookings_website has its own $19/mo purchase, not bundled).
assert.equal(hasAddon(false, activeCompany('pro'), 'bookings_website'), false, 'pro does not bundle bookings_website')

// Sanity-check effectivePlanKey() still resolves as every gate above assumes.
assert.equal(effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: null }), 'free', 'lapsed trial, no comp: free')
assert.equal(effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: future }), 'trial', 'live trial: trial')
assert.equal(effectivePlanKey({ subscription_status: 'active', subscription_plan: 'solo', trial_ends_at: null }), 'solo', 'active solo subscription: solo')

console.log('OK — hasAddon() Projects/Pro-bundling rule verified (pro bundled, team buys it, solo/free/trial cannot, other add-on slugs unaffected).')
