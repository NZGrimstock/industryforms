// eligibleWelcomeDripStages()'s day-boundary + catch-up ordering logic.
// Run from tradiee-app/:  node scripts/check-welcome-drip.mjs

import assert from 'node:assert/strict'
import { eligibleWelcomeDripStages, WELCOME_DRIP_STAGE_ORDER } from '../lib/welcome-drip.ts'

// Before day 7: nothing eligible yet.
assert.deepEqual(
  eligibleWelcomeDripStages({ daysSinceSignup: 3, daysUntilTrialEnd: 25 }),
  [],
  'day 3 of 28: no stage eligible',
)
// Exactly day 7: only day7.
assert.deepEqual(
  eligibleWelcomeDripStages({ daysSinceSignup: 7, daysUntilTrialEnd: 21 }),
  ['day7'],
  'day 7: only day7 eligible',
)
// Day 15: day7 and day14 both eligible (catch-up case — caller picks the
// first one not yet logged as sent, not just the latest).
assert.deepEqual(
  eligibleWelcomeDripStages({ daysSinceSignup: 15, daysUntilTrialEnd: 13 }),
  ['day7', 'day14'],
  'day 15: day7 and day14 both eligible, in order',
)
// Day 22: day7/14/21 all eligible.
assert.deepEqual(
  eligibleWelcomeDripStages({ daysSinceSignup: 22, daysUntilTrialEnd: 6 }),
  ['day7', 'day14', 'day21'],
  'day 22: day7/14/21 eligible, trial_ending not yet',
)
// The day before trial ends: trial_ending joins the list, after day21 —
// order guarantees day21 (sent days earlier) doesn't get skipped in favour
// of trial_ending on the same run if a cron run was ever missed.
assert.deepEqual(
  eligibleWelcomeDripStages({ daysSinceSignup: 27, daysUntilTrialEnd: 1 }),
  ['day7', 'day14', 'day21', 'trial_ending'],
  'day before trial end: all four eligible, trial_ending last',
)
// Trial already ended (daysUntilTrialEnd <= 1 covers 0 and negative too —
// a company whose cron run got delayed past the exact end moment should
// still get the email, not miss it because "tomorrow" already passed).
assert.deepEqual(
  eligibleWelcomeDripStages({ daysSinceSignup: 28, daysUntilTrialEnd: 0 }),
  ['day7', 'day14', 'day21', 'trial_ending'],
  'trial ends today: trial_ending still eligible',
)
assert.deepEqual(WELCOME_DRIP_STAGE_ORDER, ['day7', 'day14', 'day21', 'trial_ending'], 'stage order matches eligibility push order')

console.log('OK — eligibleWelcomeDripStages() day-boundary and catch-up ordering verified.')
