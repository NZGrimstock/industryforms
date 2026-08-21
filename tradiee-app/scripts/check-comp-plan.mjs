// effectivePlanKey()'s comp_plan/comp_until resolution priority.
// Run from tradiee-app/:  node scripts/check-comp-plan.mjs
//
// The SQL twin (company_effective_plan() in
// supabase/migrations/20260821110000_company_comp_plan.sql) is verified
// separately against real local Postgres — see the session notes for the
// six assertions run there (same priority order, same six cases below).

import assert from 'node:assert/strict'
import { effectivePlanKey } from '../lib/billing.ts'

const future = new Date(Date.now() + 30 * 86400000).toISOString()
const past = new Date(Date.now() - 86400000).toISOString()

assert.equal(
  effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: null }),
  'free',
  'no comp, no live trial: free',
)
assert.equal(
  effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: null, comp_plan: 'team', comp_until: future }),
  'team',
  'active comp grants the named plan',
)
assert.equal(
  effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: null, comp_plan: 'team', comp_until: past }),
  'free',
  'expired comp falls back to free, not the comp plan',
)
assert.equal(
  effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: future, comp_plan: 'team', comp_until: future }),
  'team',
  'a live comp outranks a live trial',
)
assert.equal(
  effectivePlanKey({ subscription_status: 'active', subscription_plan: 'solo', trial_ends_at: null, comp_plan: 'team', comp_until: future }),
  'solo',
  'a real active subscription outranks a comp — never override real paying status',
)
assert.equal(
  effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: null, comp_plan: 'team', comp_until: future, billing_exempt: true }),
  'pro',
  'billing_exempt outranks everything, including a comp',
)

// Missing comp_plan/comp_until entirely (a select that forgot to widen —
// exactly the gotcha this feature's rollout hit at 11 call sites) must not
// throw, and must not grant anything.
assert.equal(
  effectivePlanKey({ subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: null }),
  'free',
  'missing comp fields on the object degrade to no-comp, not a crash',
)

console.log('OK — comp_plan/comp_until resolution priority verified (billing_exempt > active sub > comp > trial > free).')
