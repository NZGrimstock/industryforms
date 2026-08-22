// shouldSendInvoiceReminder()'s due-soon-window/throttle boundary logic.
// Run from tradiee-app/:  node scripts/check-reminder-settings.mjs

import assert from 'node:assert/strict'
import { shouldSendInvoiceReminder } from '../lib/reminder-settings.ts'

const now = Date.now()

// Not yet due, but further out than this company's due-soon window: skip.
assert.equal(
  shouldSendInvoiceReminder({ daysFromDue: -10, dueSoonDays: 4, lastReminderAt: null, repeatDays: 6, now }),
  false,
  '10 days from due, 4-day window: too early',
)
// Exactly at the edge of the window: send (boundary is inclusive).
assert.equal(
  shouldSendInvoiceReminder({ daysFromDue: -4, dueSoonDays: 4, lastReminderAt: null, repeatDays: 6, now }),
  true,
  'exactly at the due-soon boundary: send',
)
// Overdue is always past the due-soon window check — always eligible on
// that axis, regardless of dueSoonDays.
assert.equal(
  shouldSendInvoiceReminder({ daysFromDue: 1, dueSoonDays: 0, lastReminderAt: null, repeatDays: 6, now }),
  true,
  'overdue is never blocked by the due-soon window',
)
// Never reminded before: always eligible on the throttle axis.
assert.equal(
  shouldSendInvoiceReminder({ daysFromDue: 0, dueSoonDays: 4, lastReminderAt: null, repeatDays: 6, now }),
  true,
  'no last_reminder_at: not throttled',
)
// Reminded recently, inside the repeat window: throttled.
assert.equal(
  shouldSendInvoiceReminder({ daysFromDue: 5, dueSoonDays: 4, lastReminderAt: new Date(now - 2 * 86400000).toISOString(), repeatDays: 6, now }),
  false,
  'reminded 2 days ago, 6-day repeat: still throttled',
)
// Reminded exactly repeatDays ago: eligible again.
assert.equal(
  shouldSendInvoiceReminder({ daysFromDue: 5, dueSoonDays: 4, lastReminderAt: new Date(now - 6 * 86400000).toISOString(), repeatDays: 6, now }),
  true,
  'reminded exactly 6 days ago, 6-day repeat: eligible again',
)

console.log('OK — shouldSendInvoiceReminder() due-soon window and repeat throttle verified.')
