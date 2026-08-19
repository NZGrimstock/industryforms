-- Variations (change orders): extra work agreed after the quote was accepted.
--
-- Three jobs this does:
--   1. Records the extra work, itemised, with its own document number.
--   2. Gets it approved — either by the customer signing at /v/<token> (same
--      pattern as quote acceptance, 20260802130000) or by an owner/admin
--      marking it approved after agreeing on site.
--   3. Raises the job's invoiceable ceiling, so the fully-invoiced lock
--      (20260815100000) reopens by itself once the variation is approved.
--
-- Deliberately NOT added to sync-rules.yaml or the PowerSync publication, for
-- the same reason as credit_notes (20260816100000): variations are sell-side
-- money, owner/admin-only, and staff devices never sync quotes/invoices at
-- all. Skipping PowerSync sidesteps the publication/backfill trap entirely.
-- Mobile is a deliberate follow-up, not an oversight.

-- doc_counters.kind carries its own inline whitelist, separate from the
-- generic assign_doc_number() trigger, which gives no hint it exists — see
-- the root CLAUDE.md note. Every insert hard-fails with an unrelated-looking
-- check-constraint error without this.
alter table public.doc_counters drop constraint doc_counters_kind_check;
alter table public.doc_counters add constraint doc_counters_kind_check
  check (kind in ('quote', 'invoice', 'job', 'po', 'credit_note', 'variation'));

alter table companies
  add column if not exists variation_prefix text not null default 'VAR-';

create table if not exists variations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,
  -- Context only. The ceiling maths reads the job's own quote_id, so a
  -- variation never needs this to be set to work correctly.
  quote_id          uuid references quotes(id) on delete set null,
  variation_number  text not null,
  title             text not null,
  description       text,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'approved', 'declined', 'void')),

  -- Same shape as quotes/invoices. No document-level discount: a variation is
  -- already an adjustment, and a discount on top of one is better expressed by
  -- editing the line prices than by a second layer of maths to reconcile.
  subtotal          numeric(12,2) not null default 0,
  gst_amount        numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,

  public_token      uuid not null default gen_random_uuid(),
  sent_at           timestamptz,
  viewed_at         timestamptz,
  approved_at       timestamptz,
  declined_at       timestamptz,

  -- Mirrors quotes.signature_url/signed_by_name/signed_at (20260802130000).
  -- Null when an owner/admin marked it approved rather than the customer
  -- signing — approved_by_profile_id records who did in that case.
  signature_url     text,
  signed_by_name    text,
  signed_at         timestamptz,
  approved_by_profile_id uuid references profiles(id) on delete set null,

  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, variation_number)
);
create index if not exists idx_variations_company on variations(company_id);
create index if not exists idx_variations_job on variations(job_id, status);
create unique index if not exists idx_variations_public_token on variations(public_token);

create table if not exists variation_items (
  id                 uuid primary key default gen_random_uuid(),
  variation_id       uuid not null references variations(id) on delete cascade,
  price_list_item_id uuid references price_list_items(id) on delete set null,
  type               line_item_type not null default 'material',
  description        text not null,
  quantity           numeric(10,2) not null default 1,
  unit               text not null default 'each',
  unit_cost          numeric(10,2) not null default 0,
  unit_price         numeric(10,2) not null default 0,
  -- Per-line rate (fraction), matching invoice_line_items — null falls back to
  -- the company default so mixed/GST-free lines stay possible.
  tax_rate           numeric(6,4),
  line_total         numeric(12,2) not null default 0,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists idx_variation_items_variation on variation_items(variation_id);

create trigger trg_variations_updated_at before update on variations
  for each row execute function set_updated_at();

-- Reuses the generic numbering trigger, like every other document type.
create trigger trg_assign_variation_number before insert on variations
  for each row execute function public.assign_doc_number('variation', 'variation_number', 'variation_prefix', 'VAR-');

alter table variations enable row level security;
alter table variation_items enable row level security;

-- Owner/admin only, matching invoices and credit_notes (031_role_based_access):
-- changing what a customer owes is at least as sensitive as recording it.
create policy "admins select variations" on variations
  for select using (company_id = current_company_id() and is_admin_or_owner());
create policy "admins write variations" on variations
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

create policy "admins select variation items" on variation_items
  for select using (variation_id in (select id from variations where company_id = current_company_id() and is_admin_or_owner()));
create policy "admins write variation items" on variation_items
  for all using (variation_id in (select id from variations where company_id = current_company_id() and is_admin_or_owner()))
  with check (variation_id in (select id from variations where company_id = current_company_id() and is_admin_or_owner()));

-- ---------------------------------------------------------------------------
-- The ceiling: approved variations raise what a job may be invoiced to.
-- ---------------------------------------------------------------------------
--
-- Two changes to job_is_locked() here.
--
-- 1. Approved variations are added to the quoted ceiling. This is what makes
--    the lock reopen on its own: approve a variation on a fully-invoiced job
--    and it stops being fully invoiced, with no need to touch the
--    invoice_lock_override escape hatch.
--
-- 2. Bug fix, found while writing this: the invoiced side summed
--    invoices.SUBTOTAL (pre-tax, pre-discount) and compared it against
--    quotes.TOTAL (tax-inclusive). The TypeScript twin — summarizeInvoices()
--    in lib/job-financials.ts, feeding invoiceGuard() — has always summed
--    invoices.TOTAL. So the database needed roughly a GST rate more billed
--    than the app did before it agreed a job was locked. These two are
--    deliberately duplicated (SQL trigger vs TS) and documented in both places
--    as a drift risk to watch; this is that drift, now closed. Summing total
--    is the correct side: it is the figure the customer actually owes, and the
--    one the quoted ceiling is expressed in.
create or replace function job_is_locked(p_job_id uuid) returns boolean as $$
declare
  v_quote_total numeric;
  v_override    boolean;
  v_variations  numeric;
  v_invoiced    numeric;
begin
  select q.total, j.invoice_lock_override into v_quote_total, v_override
  from jobs j
  left join quotes q on q.id = j.quote_id
  where j.id = p_job_id;

  -- A job with no quote has no ceiling to be "full" against, so a variation
  -- on one can't create a ceiling either — matches jobTotal()/invoiceGuard(),
  -- which fall back to "whatever's been invoiced" for time-and-materials work.
  if v_quote_total is null or v_override then
    return false;
  end if;

  select coalesce(sum(total), 0) into v_variations
  from variations
  where job_id = p_job_id and status = 'approved';

  select coalesce(sum(total), 0) into v_invoiced
  from invoices
  where job_id = p_job_id and status <> 'void';

  return v_invoiced >= (v_quote_total + v_variations) - 0.01; -- same EPS as invoiceGuard()
end;
$$ language plpgsql stable security definer set search_path = public;

-- NOTE for anyone extending 20260815100000's lock trigger list: `variations`
-- and `variation_items` must NEVER get block_write_if_job_locked(). Raising a
-- variation is the sanctioned way OUT of a locked job — gating it behind the
-- lock would mean a fully-invoiced job could only ever be reopened via the
-- admin override, which is exactly what variations exist to avoid.
