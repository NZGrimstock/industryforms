// Runnable check for lib/credit-notes.ts — the pure math behind crediting an
// invoice and applying account credit to a later one. This is money moving
// (or a promise to move it later), so every boundary is checked explicitly
// rather than trusted from a manual read.
//
// Run:  node scripts/check-credit-notes.mjs   (from tradiee-app/)
// Exits non-zero on a regression.

import assert from 'node:assert/strict'
import { maxCreditableAmount, maxRefundableAmount, availableCreditBalance, allocateCreditApplication } from '../lib/credit-notes.ts'

// ── maxCreditableAmount ─────────────────────────────────────────────────────
{
  assert.equal(maxCreditableAmount(1000, 0), 1000, 'nothing credited yet — full invoice is creditable')
  assert.equal(maxCreditableAmount(1000, 400), 600, 'already-credited amount reduces what remains')
  assert.equal(maxCreditableAmount(1000, 1000), 0, 'fully credited — nothing left')
  assert.equal(maxCreditableAmount(1000, 1200), 0, 'over-credited somehow must still floor at 0, never negative')
}

// ── maxRefundableAmount ─────────────────────────────────────────────────────
{
  assert.equal(maxRefundableAmount(500, 0), 500, 'full Stripe-paid amount is refundable')
  assert.equal(maxRefundableAmount(500, 500), 0, 'fully refunded already')
  assert.equal(maxRefundableAmount(0, 0), 0, 'nothing paid via Stripe (e.g. bank transfer) — nothing refundable that way')
  assert.equal(maxRefundableAmount(200, 300), 0, 'must floor at 0, not go negative')
}

// ── availableCreditBalance ──────────────────────────────────────────────────
{
  const notes = [
    { amount: 200, amount_applied: 0, outcome: 'account_credit', status: 'active' },
    { amount: 100, amount_applied: 100, outcome: 'account_credit', status: 'fully_applied' },
    { amount: 50, amount_applied: 20, outcome: 'account_credit', status: 'active' },
  ]
  assert.equal(availableCreditBalance(notes), 230, 'sums remaining balance across active + partially-used notes')
}
{
  // A 'refund' note must never contribute — the money already left the
  // business via Stripe, there is nothing left to spend against a job.
  const notes = [
    { amount: 500, amount_applied: 0, outcome: 'refund', status: 'active' },
    { amount: 100, amount_applied: 0, outcome: 'account_credit', status: 'active' },
  ]
  assert.equal(availableCreditBalance(notes), 100, 'refund notes must be excluded from the spendable balance')
}
{
  // A voided note (e.g. issued in error) must not contribute either.
  const notes = [{ amount: 500, amount_applied: 0, outcome: 'account_credit', status: 'void' }]
  assert.equal(availableCreditBalance(notes), 0, 'void notes must be excluded')
}

// ── allocateCreditApplication: FIFO across a single note ────────────────────
{
  const notes = [{ id: 'a', amount: 500, amount_applied: 0, outcome: 'account_credit', status: 'active' }]
  const out = allocateCreditApplication(notes, 200)
  assert.deepEqual(out, [{ id: 'a', amount: 200 }], 'partial draw from a single note')
}

// ── allocateCreditApplication: spans multiple notes, oldest (first array
// position) drawn first, stops once the request is covered ─────────────────
{
  const notes = [
    { id: 'oldest', amount: 100, amount_applied: 0, outcome: 'account_credit', status: 'active' },
    { id: 'middle', amount: 100, amount_applied: 0, outcome: 'account_credit', status: 'active' },
    { id: 'newest', amount: 100, amount_applied: 0, outcome: 'account_credit', status: 'active' },
  ]
  const out = allocateCreditApplication(notes, 150)
  assert.deepEqual(out, [{ id: 'oldest', amount: 100 }, { id: 'middle', amount: 50 }],
    'draws the oldest note fully before touching the next, and never touches the third once covered')
}

// ── allocateCreditApplication: a partially-used note only offers its
// remaining balance, not its original amount ───────────────────────────────
{
  const notes = [{ id: 'a', amount: 500, amount_applied: 450, outcome: 'account_credit', status: 'active' }]
  const out = allocateCreditApplication(notes, 100)
  assert.deepEqual(out, [{ id: 'a', amount: 50 }], 'only the remaining 50, not the full 500')
}

// ── allocateCreditApplication: silently caps at what's available rather
// than over-allocating — the API route is responsible for rejecting a
// request that exceeds balance BEFORE calling this, this function just
// never manufactures money that isn't there ─────────────────────────────────
{
  const notes = [{ id: 'a', amount: 50, amount_applied: 0, outcome: 'account_credit', status: 'active' }]
  const out = allocateCreditApplication(notes, 500)
  const total = out.reduce((s, a) => s + a.amount, 0)
  assert.equal(total, 50, 'never allocates more than the notes actually hold')
}

// ── allocateCreditApplication: refund and void notes in the same list are
// skipped entirely, not just excluded from the balance sum ─────────────────
{
  const notes = [
    { id: 'refund-note', amount: 200, amount_applied: 0, outcome: 'refund', status: 'active' },
    { id: 'void-note', amount: 200, amount_applied: 0, outcome: 'account_credit', status: 'void' },
    { id: 'real-credit', amount: 200, amount_applied: 0, outcome: 'account_credit', status: 'active' },
  ]
  const out = allocateCreditApplication(notes, 200)
  assert.deepEqual(out, [{ id: 'real-credit', amount: 200 }], 'must skip past refund/void notes to reach real credit')
}

// ── allocateCreditApplication: nothing to allocate returns an empty array,
// not a zero-amount allocation (the API route treats [] as "reject") ───────
{
  assert.deepEqual(allocateCreditApplication([], 100), [])
  const exhausted = [{ id: 'a', amount: 100, amount_applied: 100, outcome: 'account_credit', status: 'active' }]
  assert.deepEqual(allocateCreditApplication(exhausted, 100), [], 'a fully-applied note offers nothing')
}

console.log('check-credit-notes: all assertions passed')
