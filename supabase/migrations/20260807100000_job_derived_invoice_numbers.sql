-- Invoices linked to a job take that job's own number (job J-1046's first
-- invoice becomes INV-1046) instead of the company-wide sequential counter —
-- matches how the business already numbers paperwork by job. Additional
-- invoices on the same job (progress claims, re-invoicing) get a -1, -2, -3
-- suffix. Falls back to the ordinary counter when there's no job, or when the
-- derived number collides with one already in use (e.g. a legacy invoice
-- issued before this scheme existed) — a numbering scheme must never make
-- the insert fail.

alter table jobs add column if not exists invoice_seq integer not null default 0;

-- Atomically bump and return this job's own invoice sequence. Row-locks the
-- job (via the UPDATE), so concurrent invoice creates for the same job never
-- get the same suffix — same race-safety property as next_doc_number().
create or replace function public.next_job_invoice_seq(p_job uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_next integer;
begin
  update public.jobs set invoice_seq = invoice_seq + 1 where id = p_job returning invoice_seq into v_next;
  return v_next;
end;
$$;

-- Extends assign_doc_number() (20260716120000): invoices linked to a job get
-- job-derived numbering; everything else (quotes/jobs/POs, and jobless
-- invoices) keeps the existing company-wide counter behaviour untouched.
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
  v_job_id  uuid;
  v_job_number text;
  v_numeric text;
  v_seq     integer;
begin
  if current_setting('app.skip_doc_number', true) = '1' then
    return new;
  end if;
  if v_company is null then
    return new; -- no company to scope to; leave as-is
  end if;

  execute format('select coalesce((select %I from public.companies where id = $1), $2)', v_prefcol)
    into v_prefix using v_company, v_fallback;

  if v_kind = 'invoice' then
    v_job_id := (to_jsonb(new) ->> 'job_id')::uuid;
    if v_job_id is not null then
      select job_number into v_job_number from public.jobs where id = v_job_id;
      v_numeric := substring(coalesce(v_job_number, '') from '(\d+)$');
      if v_numeric is not null then
        v_seq := public.next_job_invoice_seq(v_job_id);
        v_number := v_prefix || v_numeric || case when v_seq > 1 then '-' || (v_seq - 1)::text else '' end;
        -- Never let a numbering scheme fail the insert: fall back to the
        -- ordinary counter if the derived number is already taken.
        if exists (select 1 from public.invoices where company_id = v_company and invoice_number = v_number) then
          v_number := null;
        end if;
      end if;
    end if;
  end if;

  if v_number is null then
    -- Job-derived and counter-derived invoice numbers share the same
    -- namespace and both start counting from 1, so they collide often, not
    -- just in rare edge cases (e.g. company's very first counter-based
    -- invoice ("INV-0001") landing on the same number as job #1's
    -- job-derived invoice). next_doc_number() only ever advances, never
    -- reuses, so looping past any collisions is safe and terminates quickly
    -- once the counter clears the range job numbers occupy.
    loop
      v_number := v_prefix || lpad(public.next_doc_number(v_company, v_kind)::text, 4, '0');
      exit when v_kind <> 'invoice'
        or not exists (select 1 from public.invoices where company_id = v_company and invoice_number = v_number);
    end loop;
  end if;

  new := jsonb_populate_record(new, jsonb_build_object(v_numcol, v_number));
  return new;
end;
$$;
