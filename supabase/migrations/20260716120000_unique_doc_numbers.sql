-- Unique, never-reused document numbers for quotes / invoices / jobs / purchase orders.
--
-- Old scheme was count(*)+1 (lib/numbering.ts), which reuses a number whenever a
-- row is deleted and races under concurrent creates. This replaces it with a
-- per-company monotonic counter assigned by a BEFORE INSERT trigger, so the number
-- is correct regardless of which client inserts and can never be reused.

create table if not exists public.doc_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('quote','invoice','job','po')),
  last_value bigint not null default 0,
  primary key (company_id, kind)
);

alter table public.doc_counters enable row level security;

-- Read-only for same-company users (lets the app preview the next number).
-- Writes only ever happen through next_doc_number() (security definer), so there
-- is no insert/update policy for clients.
drop policy if exists "company members read doc counters" on public.doc_counters;
create policy "company members read doc counters" on public.doc_counters
  for select using (company_id = current_company_id());

-- Atomically bump and return the next value. The upsert row-locks (company,kind),
-- so concurrent callers serialize and never get the same number.
create or replace function public.next_doc_number(p_company uuid, p_kind text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_next bigint;
begin
  insert into public.doc_counters (company_id, kind, last_value)
  values (p_company, p_kind, 1)
  on conflict (company_id, kind)
  do update set last_value = public.doc_counters.last_value + 1
  returning last_value into v_next;
  return v_next;
end;
$$;

-- Trigger: assign the formatted number (prefix + zero-padded counter) on insert.
-- Overrides any client-supplied value so a stale/pre-fetched number can't collide.
-- Import/manual paths that need to keep an explicit number set
-- `select set_config('app.skip_doc_number','1', true)` in the same transaction.
create or replace function public.assign_doc_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind    text := TG_ARGV[0];
  v_numcol  text := TG_ARGV[1];
  v_prefcol text := TG_ARGV[2];
  v_fallback text := TG_ARGV[3];
  v_company uuid := (to_jsonb(new) ->> 'company_id')::uuid;
  v_prefix  text;
  v_number  text;
begin
  if current_setting('app.skip_doc_number', true) = '1' then
    return new;
  end if;
  if v_company is null then
    return new; -- no company to scope to; leave as-is
  end if;

  execute format('select coalesce((select %I from public.companies where id = $1), $2)', v_prefcol)
    into v_prefix using v_company, v_fallback;

  v_number := v_prefix || lpad(public.next_doc_number(v_company, v_kind)::text, 4, '0');
  new := jsonb_populate_record(new, jsonb_build_object(v_numcol, v_number));
  return new;
end;
$$;

-- Seed each counter from the highest number already in use, so the first
-- assigned number is max+1 and never collides with existing rows.
insert into public.doc_counters (company_id, kind, last_value)
select company_id, 'quote', coalesce(max((substring(quote_number from '(\d+)$'))::bigint), 0)
from public.quotes where company_id is not null and quote_number ~ '\d+$'
group by company_id
on conflict (company_id, kind) do update set last_value = greatest(public.doc_counters.last_value, excluded.last_value);

insert into public.doc_counters (company_id, kind, last_value)
select company_id, 'invoice', coalesce(max((substring(invoice_number from '(\d+)$'))::bigint), 0)
from public.invoices where company_id is not null and invoice_number ~ '\d+$'
group by company_id
on conflict (company_id, kind) do update set last_value = greatest(public.doc_counters.last_value, excluded.last_value);

insert into public.doc_counters (company_id, kind, last_value)
select company_id, 'job', coalesce(max((substring(job_number from '(\d+)$'))::bigint), 0)
from public.jobs where company_id is not null and job_number ~ '\d+$'
group by company_id
on conflict (company_id, kind) do update set last_value = greatest(public.doc_counters.last_value, excluded.last_value);

insert into public.doc_counters (company_id, kind, last_value)
select company_id, 'po', coalesce(max((substring(po_number from '(\d+)$'))::bigint), 0)
from public.purchase_orders where company_id is not null and po_number ~ '\d+$'
group by company_id
on conflict (company_id, kind) do update set last_value = greatest(public.doc_counters.last_value, excluded.last_value);

-- CSV import needs to keep the original invoice numbers from the old system.
-- A plain set_config() from the app wouldn't survive into the insert's transaction
-- (PostgREST runs each request separately), so do both in one SECURITY DEFINER call.
-- The seed above already folds imported numbers into the counter, so this can't
-- collide with app-generated ones.
create or replace function public.import_invoice(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.skip_doc_number', '1', true);
  insert into public.invoices (company_id, customer_id, invoice_number, invoice_date, due_date, total, status, notes)
  values (
    (p->>'company_id')::uuid,
    nullif(p->>'customer_id','')::uuid,
    p->>'invoice_number',
    nullif(p->>'invoice_date','')::date,
    nullif(p->>'due_date','')::date,
    nullif(p->>'total','')::numeric,
    p->>'status',
    p->>'notes'
  );
end;
$$;

drop trigger if exists trg_assign_quote_number on public.quotes;
create trigger trg_assign_quote_number before insert on public.quotes
  for each row execute function public.assign_doc_number('quote', 'quote_number', 'quote_prefix', 'Q-');

drop trigger if exists trg_assign_invoice_number on public.invoices;
create trigger trg_assign_invoice_number before insert on public.invoices
  for each row execute function public.assign_doc_number('invoice', 'invoice_number', 'invoice_prefix', 'INV-');

drop trigger if exists trg_assign_job_number on public.jobs;
create trigger trg_assign_job_number before insert on public.jobs
  for each row execute function public.assign_doc_number('job', 'job_number', 'job_prefix', 'J-');

drop trigger if exists trg_assign_po_number on public.purchase_orders;
create trigger trg_assign_po_number before insert on public.purchase_orders
  for each row execute function public.assign_doc_number('po', 'po_number', 'po_prefix', 'PO-');
