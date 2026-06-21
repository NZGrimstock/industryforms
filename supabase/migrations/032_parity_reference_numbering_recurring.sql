-- Tradify-parity batch 1: reference fields, configurable doc prefixes,
-- recurring jobs, job templates, and service reminders.

-- ── Reference field (customer PO / job ref) on the core documents ────────────
alter table jobs     add column if not exists reference text;
alter table quotes   add column if not exists reference text;
alter table invoices add column if not exists reference text;

-- ── Configurable document number prefixes (per company) ──────────────────────
alter table companies
  add column if not exists quote_prefix   text not null default 'Q-',
  add column if not exists invoice_prefix text not null default 'INV-',
  add column if not exists job_prefix     text not null default 'J-',
  add column if not exists po_prefix      text not null default 'PO-';

-- ── Recurring jobs (jobs already have is_recurring + recurrence_rule) ─────────
-- recurrence_rule holds a simple cadence: 'weekly' | 'fortnightly' | 'monthly'
-- | 'quarterly' | 'yearly'. The cron rolls recurrence_next forward and clones
-- the job (as a template-style source) when due.
alter table jobs
  add column if not exists recurrence_next date,
  add column if not exists recurrence_end  date,
  add column if not exists is_template     boolean not null default false;

-- ── Job templates ────────────────────────────────────────────────────────────
create table if not exists job_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  title       text,
  description text,
  tags        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists job_templates_company_idx on job_templates(company_id);

alter table job_templates enable row level security;
create policy "members select job_templates" on job_templates
  for select using (company_id = current_company_id());
create policy "admins write job_templates" on job_templates
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- ── Service reminders (e.g. annual servicing) ────────────────────────────────
create table if not exists service_reminders (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  job_id       uuid references jobs(id) on delete set null,
  title        text not null,
  due_date     date not null,
  interval     text,                       -- 'monthly'|'quarterly'|'yearly' for auto-repeat
  status       text not null default 'pending', -- 'pending'|'sent'|'done'
  last_sent_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists service_reminders_company_idx on service_reminders(company_id);
create index if not exists service_reminders_due_idx on service_reminders(due_date);

alter table service_reminders enable row level security;
create policy "members select service_reminders" on service_reminders
  for select using (company_id = current_company_id());
create policy "admins write service_reminders" on service_reminders
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

create trigger set_job_templates_updated_at before update on job_templates
  for each row execute function set_updated_at();
create trigger set_service_reminders_updated_at before update on service_reminders
  for each row execute function set_updated_at();
