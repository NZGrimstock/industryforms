-- Two-way SMS thread per customer.
--
-- Outbound rows are written by /api/sms/send; inbound rows by Twilio's
-- StatusCallback/Inbound webhook (/api/sms/inbound). Threaded under the
-- customer they're addressed to / from.

create table if not exists customer_messages (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  direction    text not null,                  -- 'inbound' | 'outbound'
  body         text not null,
  twilio_sid   text,
  from_number  text,
  to_number    text,
  created_at   timestamptz not null default now()
);
create index if not exists customer_messages_company_idx  on customer_messages(company_id, created_at desc);
create index if not exists customer_messages_customer_idx on customer_messages(customer_id, created_at desc);

alter table customer_messages enable row level security;
-- Owner/admin only (matches communications history).
create policy "admins select messages" on customer_messages
  for select using (company_id = current_company_id() and is_admin_or_owner());
create policy "admins write messages" on customer_messages
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());
