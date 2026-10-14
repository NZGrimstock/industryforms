# Sprint — Paper-style document screens (web only)

Make the quote, invoice and purchase-order screens look like the printed
document and edit them on the page itself. Give the job page a job-sheet
header. Approved mockup: Claude canvas "Paper-style document screens".

**Scope:** `tradiee-app/` only. No mobile changes, no migrations, no
PowerSync changes, no API route changes. Money maths stays exactly as it is
(`lib/pricing.ts` untouched).

## Decisions (locked)

1. **White page = what the customer/supplier receives.** Anything internal
   (cost, margin, internal notes, payments, Xero, recurring, credit notes,
   activity) goes in a dashed "Only your team sees this" rail beside the page,
   never on it.
2. **Edit on the paper.** Fields on the page are borderless inputs that show
   an orange tint on hover/focus. Lines that only exist for editing (`+ Line`,
   `+ Labour`, section toggles) are marked "not printed" and hidden in
   *Customer view*.
3. **Quotes keep separate view and edit routes.** `/quotes/new` and
   `/quotes/[id]/edit` are the paper editor (autosave unchanged).
   `/quotes/[id]` is the same paper, read-only, with an "Edit" banner for
   drafts. Merging them needs Send/Accept/Print to flush autosave first, and
   that's deferred (see Follow-ups).
4. **Invoices edit in place on `/invoices/[id]` while draft.** Each field
   saves on blur straight to `invoice_line_items` / `invoices`, then
   recomputes totals with the existing `computeTaxedTotals`. Non-draft is
   read-only in the UI. The DB already blocks this: RLS
   `admins update invoice line items` (draft only), which **silently updates
   0 rows** rather than erroring, so the UI guard is mandatory.
5. **POs edit in place on `/purchase-orders/[id]` while draft.**
   `/purchase-orders/new` becomes the paper builder.
6. **Job page:** only the header becomes paper (job sheet). Title and
   description save on blur and are read-only while `jobLocked`. The working
   cards below are unchanged.
7. **Optional quote sections stay in the quote total** (current behaviour,
   `computeTaxedTotals` over all lines). The paper shows an "Optional" tag
   only. Changing the totals is a separate decision.
8. **Print parity:** the quote PDF gains the title, section headings and
   optional tags, so print matches screen. The invoice PDF already matches.
   POs have no PDF today, so none is added.

## Files

### New
| File | What |
|---|---|
| `tradiee-app/components/documents/paper.tsx` | Server-safe layout kit: `DocumentWorkspace`, `Paper`, `PaperHeader`, `PaperFields`, `PaperBlock`, `PaperLinesHead`, `PaperSectionHeading`, `PaperTotals`, `PaperSignatures`, `PaperFootnote`, `InternalRail`, `RailCard`, `PaperLegend`, class constants `PAPER_INPUT`, `PAPER_LINE_GRID`. |
| `tradiee-app/lib/quote-sections.ts` | Pure `orderQuoteSections(sections)`: sorts sections and lines, numbers lines 1..n across sections. Used by the quote detail page, PDF route and print data. |
| `tradiee-app/scripts/check-quote-sections.mjs` | `assert` checks for `orderQuoteSections` (sorting, running numbers, empty sections, numeric-string quantities). |
| `tradiee-app/components/invoices/invoice-paper-lines.tsx` | Client: paper line table for invoices, with inline edit/delete in draft, `+ Line` / `+ Labour`, and totals from context. |
| `tradiee-app/app/(dashboard)/purchase-orders/[id]/po-paper-editor.tsx` | Client: inline-editable PO lines / dates / notes while draft. |
| `tradiee-app/app/(dashboard)/jobs/[id]/job-sheet-fields.tsx` | Client: inline title + description with save on blur. |

### Changed
| File | Change |
|---|---|
| `components/forms/quote-builder.tsx` | Layout rewritten as paper and rail. All state, save/autosave, price-list, kit and customer logic kept. Adds `company` prop, selected-line inspector (cost, discount, tax, type, billing rate, remove), Customer view toggle. |
| `app/(dashboard)/quotes/new/page.tsx`, `quotes/[id]/edit/page.tsx` | Fetch company header fields and customer `email, billing_address`, and pass `company`. |
| `app/(dashboard)/quotes/[id]/page.tsx` | Read-only paper, rail (profit, internal notes, activity/signature, customer link, converted job). Uses `orderQuoteSections`. `printData` gains `title` + `sections`. |
| `components/pdf/quote-pdf.tsx` | Optional `title`, optional `sections` (headings + "Optional" tag). Falls back to flat `lines`. |
| `app/api/quotes/[token]/pdf/route.ts` | Selects `title`, section `title`/`is_optional`, and passes `sections`. |
| `components/invoices/invoice-lines.tsx` | `InvoiceLine` gains `type`, `tax_rate`. Context gains `updateLine`. Old `InvoiceLinesCard` is removed (no other users). |
| `app/(dashboard)/invoices/[id]/page.tsx` | Paper layout. Recurring, credit notes, payments and links move to the rail. |
| `app/(dashboard)/invoices/[id]/client.tsx` | `recompute` extracted to `lib/invoice-totals.ts` (shared with the paper lines). Toolbar unchanged. |
| `lib/invoice-totals.ts` (new) | `recomputeInvoiceTotals(supabase, invoiceId, gstRate, discType, discVal)`. |
| `components/forms/purchase-order-builder.tsx` | Paper layout, same save logic. Adds a `company` prop. |
| `app/(dashboard)/purchase-orders/new/page.tsx` | Fetch company header fields. |
| `app/(dashboard)/purchase-orders/[id]/page.tsx` | Paper layout, plus rail (status steps, job link, notes). |
| `app/(dashboard)/jobs/[id]/page.tsx` | Header block → job-sheet paper. Description card removed (now on the paper). |

## Phases & Definition of Done

### Phase 1 — Kit + print parity
- [x] `paper.tsx` kit with no `'use client'` (server-renderable)
- [x] `orderQuoteSections` + `node scripts/check-quote-sections.mjs` passes
- [x] Quote PDF renders title, section headings and the Optional tag; still works with flat `lines` only
- [x] PDF route passes sections

### Phase 2 — Quote
- [x] Editor: every field from the old builder is reachable (customer + new customer, site, title, reference, expiry and 7/30/90d, estimate toggle, sections, optional (paid plans), line type, price-list typeahead, kits, billing rate, discount, tax, doc discount, message, internal notes, terms)
- [x] Autosave + Save draft + Save & send behave exactly as before
- [x] Customer view hides every edit-only control
- [x] Detail page: read-only paper, internal data only in the rail, signature shown in the signature box when signed

### Phase 3 — Invoice
- [x] Draft: edit description/qty/unit/price inline. Blur saves the line, recomputes the line total (`lineNet`, incl. `prices_include_tax`) and the invoice totals
- [x] Draft: delete a line; `+ Line` / `+ Labour` insert a line and focus it
- [x] Non-draft: no inputs at all (RLS would silently drop writes)
- [x] Existing toolbar (Add / Print / Complete / Payment / Credit / Revert / Xero) unchanged

### Phase 4 — Purchase order
- [x] New PO builder on paper, same insert logic
- [x] Draft detail: inline line edit/add/remove, required-by date, notes. Totals recomputed and saved
- [x] Sent/received/cancelled: read-only

### Phase 5 — Job sheet header
- [x] Paper header: company, job number, created, status, from quote, title, customer, site selector, assigned, tags, project selector, description
- [x] Title/description save on blur; read-only when `jobLocked`

### Phase 6 — Verify
- [x] `npx tsc --noEmit` and `npx eslint` on touched files (web)
- [x] `node scripts/check-quote-sections.mjs`
- [x] Note plainly what was / wasn't exercised against real data

## Verification log (2026-10-15)

- `tsc --noEmit` (web): clean after every phase. `eslint` on every touched file: clean.
- `node scripts/check-quote-sections.mjs`: pass. Regression: check-invoice-guard, check-job-financials,
  check-statement, check-variations, check-credit-notes pass (check-payment-terms needs local Supabase, so it wasn't run).
- **Run against local Supabase (2026-10-15)**, signed in as the test account in `supabase/LOCAL_TEST_ACCOUNT.md`, pages fetched over HTTP:
  - All screens return 200 with the expected content: quote view + edit, invoice, PO, job sheet, /quotes/new, /purchase-orders/new.
  - Draft invoice: 2 editable lines. Line + totals update succeeds. After "sent": a line update returns 200 but changes **0 rows**,
    a total update is rejected by the trigger, and the page shows no inputs plus the Locked card. After revert, inputs are back.
  - Draft PO: inputs + expected-date field. After "sent": none. Item update succeeds while draft.
  - Job title update shows on the sheet.
  - Quote PDF (`/api/quotes/[id]/pdf`): prints the title, section headings, the OPTIONAL tag and lines numbered 1–5 across sections.
- **Still not exercised:** in-browser clicking/typing (blur-to-save, typeahead, Customer view toggle, autosave). The Claude browser
  pane blocks requests to the local Supabase port and the Chrome extension wasn't connected, so test those by hand.
- Previously listed as untested: no screen was opened in a browser or run against Supabase.
  Before shipping, walk through these by hand:
  1. New quote: type lines, use the price-list typeahead, add a kit, toggle Customer view, wait for autosave, then Save & send.
  2. Edit an existing draft quote and check every section/line round-trips. Print the PDF and confirm headings + title.
  3. Draft invoice: edit a line, tab out, check the total and the PDF. Delete a line. `+ Line`. Change the due date.
  4. Sent invoice: confirm there are no inputs. Revert to draft and confirm editing returns.
  5. New PO, then edit the draft PO in place (line, notes, expected date). Mark sent and confirm it's read-only.
  6. Job: edit the title/description and confirm both are read-only on a fully-invoiced (locked) job.
- `next build` wasn't run: it would overwrite the `.next` folder a running dev server uses.
- Unrelated: about 130 files in `tradiee-app/` show as modified only because the working copies are CRLF while `HEAD` is LF.
  The files changed in this sprint are LF.

## Follow-ups (not in this sprint)
- Merge quote view + edit into one screen (needs autosave flush before Send/Accept/Print).
- Decide whether optional sections should be excluded from the quote total.
- Email/public quote page (`/q/[token]`) and public invoice (`/i/[token]`) restyle to match.
- PO PDF.
