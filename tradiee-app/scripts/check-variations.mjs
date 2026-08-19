// Variations: how approved extra work raises a job's invoiceable ceiling.
// Run from tradiee-app/:  node scripts/check-variations.mjs
//
// Pure math only. The DB half of this feature — the numbering trigger, and
// job_is_locked() reopening a locked job once a variation is approved — is
// verified against real local Postgres, not here; see the migration
// 20260820100000_variations.sql and the session notes.

import assert from 'node:assert/strict'
import { approvedVariationTotal, jobTotal, toInvoice, invoiceGuard } from '../lib/job-financials.ts'

// ---------------------------------------------------------------------------
// Only 'approved' counts toward the ceiling.
// ---------------------------------------------------------------------------
const mixed = [
  { status: 'draft',    amount: 500 },
  { status: 'sent',     amount: 900 },
  { status: 'approved', amount: 200 },
  { status: 'declined', amount: 400 },
  { status: 'void',     amount: 300 },
  { status: 'approved', amount: 50 },
]
assert.equal(approvedVariationTotal(mixed), 250, 'only approved variations count')
assert.equal(approvedVariationTotal([]), 0, 'no variations is zero, not NaN')
assert.equal(
  approvedVariationTotal([{ status: 'approved', amount: '125.50' }, { status: 'approved', amount: '74.50' }]),
  200,
  'numeric comes back from supabase-js as a string — must add, not concatenate',
)

// A sent-but-unsigned variation is a proposal, not an agreement. It must not
// move the ceiling, or a customer who never approved could be billed for it.
assert.equal(approvedVariationTotal([{ status: 'sent', amount: 1000 }]), 0, 'sent is not approved')

// ---------------------------------------------------------------------------
// jobTotal(): variations lift a real ceiling, and only a real one.
// ---------------------------------------------------------------------------
assert.equal(jobTotal(1000, 0, 200), 1200, 'approved variations raise the quoted ceiling')
assert.equal(jobTotal(1000, 0, 0), 1000, 'no variations leaves the quote total alone')
assert.equal(jobTotal('1000.00', 0, 200), 1200, 'quote total arrives as a string too')

// A time-and-materials job has no quoted ceiling to raise. It reads back
// whatever has been invoiced — same reasoning as the original jobTotal(), and
// it matches job_is_locked(), which never locks a quote-less job at all.
assert.equal(jobTotal(null, 750, 200), 750, 'no quote: ceiling stays the invoiced figure')
assert.equal(jobTotal(undefined, 0, 200), 0, 'no quote and nothing invoiced is still 0')

// Floating point: 0.1 + 0.2 must not leak into a dollar figure.
assert.equal(jobTotal(1000.1, 0, 200.2), 1200.3, 'rounded to cents, no float dust')

// ---------------------------------------------------------------------------
// The whole point: an approved variation reopens a fully-invoiced job.
// ---------------------------------------------------------------------------
{
  const quote = 1000
  const invoiced = 1000 // billed to the full quoted amount

  assert.equal(
    invoiceGuard({ jobTotal: jobTotal(quote, invoiced, 0), alreadyInvoiced: invoiced, subtotal: 0 }),
    'fully-invoiced',
    'billed to the quote with no variation: locked',
  )

  // Customer signs off $200 of extra work.
  const withVariation = jobTotal(quote, invoiced, 200)
  assert.equal(
    invoiceGuard({ jobTotal: withVariation, alreadyInvoiced: invoiced, subtotal: 0 }),
    null,
    'approving a variation reopens the job — no override needed',
  )
  assert.equal(toInvoice(withVariation, invoiced), 200, 'the variation is exactly what is left to bill')

  // Billing the variation itself must not trip the over-quote guard.
  assert.equal(
    invoiceGuard({ jobTotal: withVariation, alreadyInvoiced: invoiced, subtotal: 200 }),
    null,
    'billing the approved variation is within the raised ceiling',
  )

  // But a cent over it still is over.
  assert.equal(
    invoiceGuard({ jobTotal: withVariation, alreadyInvoiced: invoiced, subtotal: 200.5 }),
    'over-quote',
    'the raised ceiling is still a ceiling',
  )

  // Once the variation is billed too, the job locks again at the new figure.
  assert.equal(
    invoiceGuard({ jobTotal: withVariation, alreadyInvoiced: 1200, subtotal: 0 }),
    'fully-invoiced',
    'relocks at the raised ceiling',
  )
}

// A declined variation must leave a locked job locked — otherwise raising and
// declining one would be a backdoor around the lock.
{
  const ceiling = jobTotal(1000, 1000, approvedVariationTotal([{ status: 'declined', amount: 500 }]))
  assert.equal(
    invoiceGuard({ jobTotal: ceiling, alreadyInvoiced: 1000, subtotal: 0 }),
    'fully-invoiced',
    'a declined variation is not a way to unlock a job',
  )
}

// Several approved variations stack.
{
  const stacked = approvedVariationTotal([
    { status: 'approved', amount: 200 },
    { status: 'approved', amount: 350 },
    { status: 'sent', amount: 999 },
  ])
  assert.equal(stacked, 550)
  assert.equal(toInvoice(jobTotal(1000, 1000, stacked), 1000), 550, 'both approved variations are billable')
}

console.log('OK — variations: approval filter, ceiling lift, lock reopen/relock, declined-is-not-a-backdoor.')
