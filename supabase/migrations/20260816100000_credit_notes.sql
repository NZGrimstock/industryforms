-- Credit notes: issue a credit against a sent/paid invoice, either as a real
-- Stripe refund or as an account credit that sits against the customer until
-- applied to a future invoice. See CREDIT_NOTES.md (repo root) for the full
-- design — FIFO consumption order, Xero allocation flow, why this is
-- web-only.
--
-- Deliberately NOT added to sync-rules.yaml or the PowerSync publication —
-- crediting is an owner/admin back-office accounting action (invoices
-- themselves are already owner/admin-only and, per sync-rules.yaml's own
-- header comment, staff devices never get quotes/invoices at all), so there
-- is no mobile surface for this feature. Skipping PowerSync entirely avoids
-- the whole publication/backfill class of trap this project has hit twice.

alter table companies
  add column if not exists credit_note_prefix text not null default 'CN-';

-- doc_counters.kind has its own inline whitelist (20260716120000) that
-- next_doc_number()/assign_doc_number() enforce against — found by actually
-- trying to insert a credit note against real Postgres, not by reading the
-- trigger function alone; the function itself is fully generic and gave no
-- hint this second, separate constraint existed.
alter table public.doc_counters drop constraint doc_counters_kind_check;
alter table public.doc_counters add constraint doc_counters_kind_check
  check (kind in ('quote', 'invoice', 'job', 'po', 'credit_note'));

create table if not exists credit_notes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  customer_id         uuid not null references customers(id) on delete restrict,
  source_invoice_id   uuid not null references invoices(id) on delete restrict,
  credit_note_number  text not null,
  amount              numeric(12,2) not null check (amount > 0),
  outcome             text not null check (outcome in ('refund', 'account_credit')),
  -- Only meaningful for outcome='account_credit': how much of this credit
  -- has been consumed against later invoices via credit_note_applications.
  -- A 'refund' note settles immediately (money actually moves) and has
  -- nothing left to apply — enforced by the check below, not just convention.
  amount_applied      numeric(12,2) not null default 0 check (amount_applied >= 0),
  status              text not null default 'active' check (status in ('active', 'fully_applied', 'void')),
  reason              text,
  stripe_refund_id    text,
  external_system     text,
  external_id         text,
  external_synced_at  timestamptz,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, credit_note_number),
  check (outcome <> 'refund' or amount_applied = 0),
  check (amount_applied <= amount)
);
create index if not exists idx_credit_notes_company on credit_notes(company_id);
create index if not exists idx_credit_notes_customer on credit_notes(customer_id, status);
create index if not exists idx_credit_notes_source_invoice on credit_notes(source_invoice_id);

create trigger trg_credit_notes_updated_at before update on credit_notes
  for each row execute function set_updated_at();

-- Reuses the same generic numbering trigger every other document type uses
-- (migration 20260716120000) rather than a bespoke counter.
create trigger trg_assign_credit_note_number before insert on credit_notes
  for each row execute function public.assign_doc_number('credit_note', 'credit_note_number', 'credit_note_prefix', 'CN-');

-- Which invoice(s) an account-credit note's balance was applied to. A single
-- credit note can be split across more than one future invoice (the user's
-- own framing — "added to the next job/jobs"), so this is a join table, not
-- a single FK on credit_notes.
create table if not exists credit_note_applications (
  id                  uuid primary key default gen_random_uuid(),
  credit_note_id      uuid not null references credit_notes(id) on delete restrict,
  invoice_id          uuid not null references invoices(id) on delete restrict,
  amount              numeric(12,2) not null check (amount > 0),
  applied_at          timestamptz not null default now(),
  external_synced_at  timestamptz -- Xero Allocation push, tracked separately from the credit note's own sync
);
create index if not exists idx_credit_note_applications_note on credit_note_applications(credit_note_id);
create index if not exists idx_credit_note_applications_invoice on credit_note_applications(invoice_id);

alter table credit_notes enable row level security;
alter table credit_note_applications enable row level security;

-- Owner/admin only, matching invoices/payments (031_role_based_access.sql) —
-- crediting money is at least as sensitive as recording it.
create policy "admins select credit notes" on credit_notes
  for select using (company_id = current_company_id() and is_admin_or_owner());
create policy "admins write credit notes" on credit_notes
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

create policy "admins select credit note applications" on credit_note_applications
  for select using (credit_note_id in (select id from credit_notes where company_id = current_company_id() and is_admin_or_owner()));
create policy "admins write credit note applications" on credit_note_applications
  for all using (credit_note_id in (select id from credit_notes where company_id = current_company_id() and is_admin_or_owner()))
  with check (credit_note_id in (select id from credit_notes where company_id = current_company_id() and is_admin_or_owner()));
