-- Payment terms: when an invoice is due, driven by the customer's account
-- terms (falling back to the company default). Three shapes cover what NZ/AU
-- trades actually use:
--   'on_receipt'    — due the day it's invoiced
--   'net_days'      — due N days after the invoice date (a "7 day account")
--   'day_of_month'  — due on a fixed day of the FOLLOWING month, regardless
--                      of when in the current month it was invoiced (e.g.
--                      "due the 20th of the following month") — clamped to
--                      that month's last day for a day that doesn't exist in it.
--
-- companies carries the default every new customer effectively uses;
-- customers carries an explicit override (all three columns null = inherit
-- the company default). Not added to either app's PowerSync schema.ts —
-- due_date is computed server-side by the trigger below, nothing client-side
-- reads these columns directly (yet), so no sync/backfill concern.

alter table companies
  add column if not exists payment_terms_type text not null default 'net_days'
    check (payment_terms_type in ('on_receipt', 'net_days', 'day_of_month')),
  add column if not exists payment_terms_days int not null default 14
    check (payment_terms_days > 0),
  add column if not exists payment_terms_day_of_month int
    check (payment_terms_day_of_month between 1 and 31);

alter table customers
  add column if not exists payment_terms_type text
    check (payment_terms_type in ('on_receipt', 'net_days', 'day_of_month')),
  add column if not exists payment_terms_days int
    check (payment_terms_days > 0),
  add column if not exists payment_terms_day_of_month int
    check (payment_terms_day_of_month between 1 and 31);

-- Computes invoices.due_date from the customer's terms (or the company
-- default) at creation time — every invoice-creation code path (web, mobile,
-- progress claims, recurring invoices, …) gets this for free instead of each
-- one needing to replicate the math, which is exactly the kind of drift this
-- session already found and fixed once for job totals. Only fires when the
-- caller didn't already set due_date, so CSV imports / anything with an
-- explicit value keep it.
create or replace function compute_invoice_due_date() returns trigger as $$
declare
  v_type text;
  v_days int;
  v_dom int;
  v_base date := coalesce(new.invoice_date, current_date);
begin
  if new.due_date is not null then
    return new;
  end if;

  select coalesce(cu.payment_terms_type, co.payment_terms_type),
         coalesce(cu.payment_terms_days, co.payment_terms_days),
         coalesce(cu.payment_terms_day_of_month, co.payment_terms_day_of_month)
    into v_type, v_days, v_dom
  from companies co
  left join customers cu on cu.id = new.customer_id
  where co.id = new.company_id;

  if v_type = 'on_receipt' then
    new.due_date := v_base;
  elsif v_type = 'day_of_month' and v_dom is not null then
    new.due_date := least(
      (date_trunc('month', v_base) + interval '1 month')::date + (v_dom - 1),
      (date_trunc('month', v_base) + interval '2 month' - interval '1 day')::date
    );
  else
    new.due_date := v_base + make_interval(days => coalesce(v_days, 14));
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_invoices_due_date on invoices;
create trigger trg_invoices_due_date
  before insert on invoices
  for each row execute function compute_invoice_due_date();
