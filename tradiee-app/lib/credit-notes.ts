// Pure math for credit notes — kept separate from the API routes so the two
// money-critical questions ("how much CAN be credited" and "how much
// account credit is actually available") are each answered in exactly one
// place and are checkable without a database. See CREDIT_NOTES.md and
// scripts/check-credit-notes.mjs.

export type CreditNoteRow = {
  amount: number | string
  amount_applied: number | string
  outcome: 'refund' | 'account_credit'
  status: 'active' | 'fully_applied' | 'void'
}

const EPS = 0.01

// How much of an invoice can still be credited: never more than the invoice
// was ever billed for, minus whatever's already been credited against it
// (across every non-void credit note, refund or account_credit — both
// permanently reduce what that invoice can still be credited for).
export function maxCreditableAmount(invoiceTotal: number, alreadyCredited: number): number {
  return Math.max(0, invoiceTotal - alreadyCredited)
}

// How much can be refunded via Stripe specifically: bounded by what was
// actually collected through Stripe on that invoice (bank transfer/cash
// payments have no Stripe transaction to reverse), minus whatever's already
// been refunded. Independent of maxCreditableAmount — a fully-paid invoice
// might have a lower Stripe-paid total than its invoice total if it was
// paid partly by bank transfer, partly by card.
export function maxRefundableAmount(stripePaidTotal: number, alreadyRefunded: number): number {
  return Math.max(0, stripePaidTotal - alreadyRefunded)
}

// A customer's spendable balance: active/partially-used account-credit notes
// only. 'refund' notes never contribute — the money already left the
// business, there's nothing left to spend. 'void' notes don't either.
export function availableCreditBalance(notes: CreditNoteRow[]): number {
  return notes
    .filter(n => n.outcome === 'account_credit' && n.status !== 'void')
    .reduce((sum, n) => sum + (Number(n.amount) - Number(n.amount_applied)), 0)
}

// Split a requested application amount across a customer's available credit
// notes, oldest first (FIFO — first issued, first spent, the same fairness
// rule a genuine store-credit ledger would use). `notes` must already be
// sorted oldest-first by the caller; this function doesn't re-sort so it
// stays agnostic to how "oldest" is represented (created_at vs credit_note_number).
// Returns only the notes actually touched, each with the amount to draw from
// it — never more than that note's own remaining balance, and the total
// drawn never exceeds `requested` (silently caps at whatever's available;
// the caller decides whether to also reject a request that exceeds balance).
export function allocateCreditApplication(
  notes: Array<CreditNoteRow & { id: string }>,
  requested: number
): Array<{ id: string; amount: number }> {
  const allocations: Array<{ id: string; amount: number }> = []
  let remaining = requested
  for (const note of notes) {
    if (remaining <= EPS) break
    if (note.outcome !== 'account_credit' || note.status === 'void') continue
    const noteBalance = Number(note.amount) - Number(note.amount_applied)
    if (noteBalance <= EPS) continue
    const draw = Math.min(noteBalance, remaining)
    allocations.push({ id: note.id, amount: Math.round(draw * 100) / 100 })
    remaining -= draw
  }
  return allocations
}
