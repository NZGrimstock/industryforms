-- Tradify-parity batch 2 (P1): payment methods, billing rates, recurring
-- invoices, and document branding fields.

-- ── Configurable payment methods ─────────────────────────────────────────────
create table if not exists payment_methods (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists payment_methods_company_idx on payment_methods(company_id);
alter table payment_methods enable row level security;
create policy "members select payment_methods" on payment_methods
  for select using (company_id = current_company_id());
create policy "admins write payment_methods" on payment_methods
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- ── Billing rates (named hourly charge-out rates) ────────────────────────────
create table if not exists billing_rates (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  rate       numeric(10,2) not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists billing_rates_company_idx on billing_rates(company_id);
alter table billing_rates enable row level security;
create policy "members select billing_rates" on billing_rates
  for select using (company_id = current_company_id());
create policy "admins write billing_rates" on billing_rates
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- ── Recurring invoices (mirror recurring jobs) ───────────────────────────────
alter table invoices
  add column if not exists is_recurring    boolean not null default false,
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_next date,
  add column if not exists recurrence_end  date;

-- ── Document branding shown on customer-facing quotes/invoices ────────────────
alter table companies
  add column if not exists payment_instructions text,
  add column if not exists invoice_footer       text,
  add column if not exists quote_footer         text;
