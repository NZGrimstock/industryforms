-- Sprint A unified inbox: additive columns + indexes on customer_messages.
-- Idempotent — safe to re-run.

alter table customer_messages
  add column if not exists read_at     timestamptz,
  add column if not exists assigned_to  uuid references profiles(id) on delete set null,
  add column if not exists status       text not null default 'open',
  add column if not exists source       text not null default 'sms';

-- status: open | pending | closed | spam
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_messages_status_chk') then
    alter table customer_messages
      add constraint customer_messages_status_chk
      check (status in ('open','pending','closed','spam'));
  end if;
end $$;

-- source: sms | email | booking | enquiry | web_lead
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_messages_source_chk') then
    alter table customer_messages
      add constraint customer_messages_source_chk
      check (source in ('sms','email','booking','enquiry','web_lead'));
  end if;
end $$;

-- Inbox filter indexes
create index if not exists customer_messages_company_status_idx
  on customer_messages(company_id, status, created_at desc);
create index if not exists customer_messages_company_unread_idx
  on customer_messages(company_id, created_at desc) where read_at is null;
create index if not exists customer_messages_company_unmatched_idx
  on customer_messages(company_id, created_at desc) where customer_id is null;
