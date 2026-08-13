// Runnable check for invoiceGuard() in lib/job-financials.ts — which
// confirmation must be shown before creating another invoice against a job.
//
// This exists because the ordering of the two guards was a real, shipped bug:
// billing "the full amount" on an already-fully-invoiced job produces a
// subtotal of 0, which fails the over-quote guard's `subtotal > EPS` test, so
// checking over-quote first let a second EMPTY draft invoice through with no
// prompt at all. That silently consumed an invoice number and completed the
// job. The first assertion below is that exact case.
//
// Run:  node scripts/check-invoice-guard.mjs   (from tradiee-app/)
// Exits non-zero on a regression.

import assert from 'node:assert/strict'
import { invoiceGuard } from '../lib/job-financials.ts'

// ── The shipped bug: fully invoiced, "invoice full amount" again ───────────
// subtotal is 0 because there is nothing left to bill. Must still prompt.
{
  const g = invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 1000, subtotal: 0 })
  assert.equal(g, 'fully-invoiced', 'a fully-invoiced job must prompt even when subtotal is 0')
}

// ── Ordering: fully-invoiced wins over over-quote ─────────────────────────
// Both conditions are true here; the more specific/actionable one must win,
// otherwise the user gets "you are billing above the quote" when what they
// actually want is a link to the invoice that already exists.
{
  const g = invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 1000, subtotal: 500 })
  assert.equal(g, 'fully-invoiced', 'fully-invoiced must be checked before over-quote')
}

// ── Partly invoiced, billing the balance — no prompt ───────────────────────
{
  const g = invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 400, subtotal: 600 })
  assert.equal(g, null, 'billing exactly the remaining balance must not prompt')
}

// ── Partly invoiced, billing past the quote — over-quote ───────────────────
{
  const g = invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 400, subtotal: 900 })
  assert.equal(g, 'over-quote', 'exceeding the quoted total must prompt')
}

// ── First invoice on a fresh job — no prompt ───────────────────────────────
{
  const g = invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 0, subtotal: 1000 })
  assert.equal(g, null, 'the first full invoice must not prompt')
}

// ── force=true always proceeds (the "yes, create another" retry) ───────────
{
  assert.equal(invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 1000, subtotal: 0, force: true }), null)
  assert.equal(invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 400, subtotal: 900, force: true }), null)
}

// ── Time-and-materials job (no quote) — nothing to compare against ─────────
// jobTotal 0 means no agreed ceiling; neither guard can meaningfully fire, and
// firing 'fully-invoiced' here would block every T&M invoice.
{
  assert.equal(invoiceGuard({ jobTotal: 0, alreadyInvoiced: 0, subtotal: 500 }), null,
    'a job with no quoted total must never be blocked')
  assert.equal(invoiceGuard({ jobTotal: 0, alreadyInvoiced: 800, subtotal: 500 }), null,
    'repeat T&M invoicing must stay unblocked')
}

// ── Floating-point boundaries ──────────────────────────────────────────────
// Money arrives as Postgres numeric and sums drift; a cent of float error must
// not decide whether the user gets prompted.
{
  assert.equal(invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 999.995, subtotal: 0 }), 'fully-invoiced',
    'a sub-cent shortfall still counts as fully invoiced')
  assert.equal(invoiceGuard({ jobTotal: 1000, alreadyInvoiced: 400, subtotal: 600.005 }), null,
    'a sub-cent overage must not trigger the over-quote prompt')
  // 0.1 + 0.2 = 0.30000000000000004 — the classic case, in money terms.
  assert.equal(invoiceGuard({ jobTotal: 0.3, alreadyInvoiced: 0.1 + 0.2, subtotal: 0 }), 'fully-invoiced',
    'float addition error must not hide a fully-invoiced job')
}

console.log('check-invoice-guard: all assertions passed')
