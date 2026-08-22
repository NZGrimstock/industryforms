-- Per-company control over the automated quote-followup/invoice-dunning
-- reminders in app/api/reminders/route.ts: on/off, timing, and a short
-- custom message line inserted into the existing branded template (not raw
-- HTML — same trust boundary as a quote's "Message to customer"/"Terms &
-- conditions" fields, which are also company-authored plain text with no
-- escaping, not third-party content).
create table company_reminder_settings (
  company_id                  uuid primary key references companies(id) on delete cascade,

  quote_followup_enabled      boolean not null default true,
  quote_followup_delay_days   smallint not null default 3 check (quote_followup_delay_days between 1 and 30),
  quote_followup_repeat_days  smallint not null default 7 check (quote_followup_repeat_days between 1 and 30),
  quote_followup_message      text,

  invoice_reminder_enabled    boolean not null default true,
  invoice_due_soon_days       smallint not null default 4 check (invoice_due_soon_days between 0 and 14),
  invoice_reminder_repeat_days smallint not null default 6 check (invoice_reminder_repeat_days between 1 and 30),
  invoice_due_soon_message    text,
  invoice_overdue_message     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_company_reminder_settings_updated_at before update on company_reminder_settings
  for each row execute function set_updated_at();

alter table company_reminder_settings enable row level security;
create policy "members select reminder_settings" on company_reminder_settings
  for select using (company_id = current_company_id());
create policy "admins write reminder_settings" on company_reminder_settings
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- The initial quote follow-up delay is set by a trigger (006_reminders_followup.sql),
-- not by the reminders cron — the cron only handles repeats after the first
-- one. Point it at the company's configured delay instead of a hardcoded
-- 3 days, defaulting to 3 for a company with no settings row (most won't
-- have one — this table is opt-in-to-customize, not seeded at signup).
create or replace function set_quote_follow_up()
returns trigger language plpgsql as $$
declare
  v_delay_days smallint;
begin
  if new.status = 'sent' and old.status = 'draft' and new.follow_up_at is null then
    select quote_followup_delay_days into v_delay_days
      from company_reminder_settings where company_id = new.company_id;
    new.follow_up_at := now() + make_interval(days => coalesce(v_delay_days, 3)::integer);
  end if;
  return new;
end;
$$;
