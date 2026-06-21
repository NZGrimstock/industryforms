-- Checklist gaps: quote/invoice templates, customer communications history,
-- and an inbound email token for the enquiry email inbox.

-- ── Document templates (reusable quote / invoice line-item sets) ──────────────
create table if not exists document_templates (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind       text not null default 'quote',   -- 'quote' | 'invoice'
  name       text not null,
  data       jsonb not null default '{}'::jsonb, -- { title, terms, sections:[{title,lines:[...]}] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_templates_company_idx on document_templates(company_id);
alter table document_templates enable row level security;
create policy "members select document_templates" on document_templates
  for select using (company_id = current_company_id());
create policy "admins write document_templates" on document_templates
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- ── Customer communications history ──────────────────────────────────────────
create table if not exists communications (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  channel      text not null,                 -- 'email' | 'sms'
  direction    text not null default 'outbound', -- 'outbound' | 'inbound'
  subject      text,
  summary      text,
  related_type text,                          -- 'quote' | 'invoice' | 'reminder' | 'enquiry'
  related_id   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists communications_company_idx on communications(company_id);
create index if not exists communications_customer_idx on communications(customer_id);
alter table communications enable row level security;
-- Customer comms are financial-adjacent — owner/admin only (matches invoices/quotes).
create policy "admins select communications" on communications
  for select using (company_id = current_company_id() and is_admin_or_owner());
create policy "admins write communications" on communications
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- ── Inbound email token (enquiry email inbox) ────────────────────────────────
alter table companies add column if not exists inbound_email_token text;
create unique index if not exists companies_inbound_email_token_idx on companies(inbound_email_token) where inbound_email_token is not null;
