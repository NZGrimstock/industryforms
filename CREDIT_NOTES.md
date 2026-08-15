# Credit Notes — Reference

Built 2026-08-16. Covers what the feature does and the decisions behind it —
read this before touching `credit_notes`/`credit_note_applications` or the
routes in `app/api/invoices/[id]/credit`, `.../apply-credit`, or
`app/api/xero/sync-credit-note`.

## What it is

Crediting an invoice creates a `credit_notes` row against that invoice, for
one of two outcomes staff choose explicitly:

- **`refund`** — money moves immediately via a real Stripe refund, bounded by
  what was actually collected via Stripe on that invoice (a bank-transfer or
  cash payment has nothing to reverse). Can span more than one Stripe payment
  on the same invoice (e.g. a deposit + balance), refunded in order until the
  requested amount is covered.
- **`account_credit`** — no money moves. The amount becomes a spendable
  balance against the *customer* (not the invoice), consumed later via
  `POST /api/invoices/[id]/apply-credit` against a future draft invoice — the
  user's own framing was "sits against the account until the next job."

All amounts are **GST-inclusive** throughout — matches `invoice.total`
(not `subtotal`) and what a Stripe refund actually moves. Don't mix in an
excl.-GST figure anywhere in this feature.

## Applying credit: FIFO, draft-only, can span notes and invoices

`allocateCreditApplication()` (`lib/credit-notes.ts`) draws from a customer's
active credit notes oldest-first. A single application can span more than one
credit note if the oldest doesn't cover the full request; conversely one
credit note can be split across several future invoices over time (tracked
via `credit_note_applications`, a join table, not a 1:1 FK).

Applying credit only works on a **draft** invoice. Not a technical
limitation — `invoice_line_items` are already locked to draft-only at the RLS
layer (`20260804120000`), and applying credit to an already-sent invoice
would mean silently changing a document the customer has already seen. If a
sent invoice needs credit applied, revert it to draft first (existing action)
rather than this feature growing a second unlock path.

The application itself is a negative `invoice_line_items` row
("Account credit applied (CN-0001, CN-0002)"), then a totals recompute using
the same `computeTaxedTotals()` every other invoice mutation uses. Nothing
exotic — it's the same shape as the existing "Less previously invoiced" line
the job-invoicing flow already inserts.

## Xero

Two independent, both **manual** (this app never auto-syncs to Xero in the
background, for anything):

- `POST /api/xero/sync-credit-note` pushes the credit note as a real
  `ACCRECCREDIT` (Accounts Receivable Credit Note), not a negative invoice —
  the accounting-correct document type. One line item referencing the source
  invoice number, not a copy of that invoice's line items.
- Applying credit locally also best-effort pushes a Xero **Allocation**
  (`PUT /CreditNotes/{id}/Allocations`) — but only when *both* the credit note
  and the target invoice already have a Xero ID. A failure or missing sync
  state here is swallowed (logged, not returned as an error): the local
  application already succeeded by that point, and Xero sync state must never
  hold hostage a credit that's already been applied in the app.

## Why this is web-only

Invoices are already owner/admin-only (`031_role_based_access.sql`), and
`sync-rules.yaml`'s own header comment says staff devices never get
quotes/invoices at all. Crediting money is a back-office accounting action on
top of a surface mobile staff can't see in the first place — there's no
audience for a mobile version. `credit_notes`/`credit_note_applications` are
deliberately **not** in `sync-rules.yaml` or the PowerSync publication, which
sidesteps the whole publication/backfill trap this project has hit twice.

## A gotcha found while building this, now general knowledge

`doc_counters.kind` has its own inline whitelist check constraint, separate
from the generic `assign_doc_number()` trigger — see the "Adding a new
document type" section in the root `CLAUDE.md`. Reusing that trigger for
credit notes required its own migration statement widening the constraint,
found only by actually inserting a row against real Postgres.

## A bug noticed in passing, deliberately not fixed here

`app/api/bookings/refund/route.ts` calls `stripe.refunds.create({payment_intent, amount})`
**without** `connectOptions(company)`. Every PaymentIntent-creating route in
this app (`stripe/payment-intent`, `bookings/deposit-intent`,
`stripe/terminal/payment-intent`) passes `connectOptions` so the charge lives
on the connected account — if a booking deposit was ever collected that way,
refunding it without the same option would fail with "No such payment_intent",
the exact class of bug root-caused in the 2026-08-12 Tap to Pay session. This
feature's own refund route (`app/api/invoices/[id]/credit`) passes
`connectOptions` correctly. Flagged, not fixed — out of scope for this pass.

## Verified

`tsc`/`eslint` clean across every touched file. `scripts/check-credit-notes.mjs`
covers the pure math (creditable/refundable ceilings, FIFO allocation,
partially-used notes, refund/void notes excluded from balance, empty
allocation cases). Migration applied to real local Postgres and exercised
directly: sequential per-company numbering (`CN-0001`, `CN-0002`,
independent counters per company), both check constraints (`amount_applied`
can't exceed `amount`; a `refund` note can't carry `amount_applied > 0`), and
confirmed a failed insert doesn't burn a document number (Postgres rolls back
the trigger's counter bump along with the rest of the failed statement).

**Not verified**: a real Stripe refund call (needs a live Stripe test payment)
and a real Xero CreditNote/Allocation push (needs a connected Xero sandbox).
Both follow the exact same patterns as the already-working invoice sync and
booking-refund code, but neither has been exercised end-to-end.
