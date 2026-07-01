alter table customers
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz;

create index if not exists idx_customers_company_active
  on customers(company_id, is_active);

alter table companies
  add column if not exists standard_markup_enabled boolean not null default false,
  add column if not exists standard_markup_pct numeric(6,2) not null default 80;
