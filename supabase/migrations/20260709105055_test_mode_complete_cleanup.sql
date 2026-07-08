-- Fixes two real bugs in the test-mode (demo data) feature:
--
-- 1. Quotes were never tracked or deleted on disable at all, and any record
--    the *user* created while test mode was on (a quote, an extra job, a new
--    customer) was never tracked either — only the initial seed rows were.
--    If a tracked customer was still referenced by one of these untracked
--    rows (quotes/jobs/invoices all have `customer_id ... on delete
--    restrict`), the DELETE silently failed (no error was checked) and
--    test_mode/test_data_ids were cleared anyway — permanently orphaning
--    both the customer and whatever referenced it as indistinguishable-from-
--    real data. "same with customer, jobs etc" in the bug report.
--
-- Fix: a trigger auto-tracks every row created in the relevant tables while
-- a company is in test_mode, regardless of which code path created it. And
-- disable is now one atomic Postgres function — if any delete fails the
-- whole cleanup rolls back and test_mode stays on, instead of silently
-- succeeding with orphans left behind.

create or replace function public.track_test_data_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test_mode boolean;
begin
  select test_mode into v_test_mode from companies where id = new.company_id;
  if v_test_mode then
    update companies
    set test_data_ids = jsonb_set(
      coalesce(test_data_ids, '{}'::jsonb),
      array[TG_TABLE_NAME],
      coalesce(test_data_ids -> TG_TABLE_NAME, '[]'::jsonb) || to_jsonb(new.id::text)
    )
    where id = new.company_id;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'quotes', 'jobs', 'invoices', 'enquiries', 'projects', 'suppliers', 'purchase_orders', 'bills', 'travel_logs']
  loop
    execute format('drop trigger if exists trg_track_test_data on %I', t);
    execute format('create trigger trg_track_test_data after insert on %I for each row execute function public.track_test_data_row()', t);
  end loop;
end $$;

-- Atomic cleanup — deletes in FK-safe order (quotes/jobs/invoices reference
-- customers with ON DELETE RESTRICT, so they must go first; everything else
-- cascades from these automatically: quote_sections/line_items, job_materials/
-- tasks/visits/photos, invoice_line_items/payments, customer_sites).
create or replace function public.disable_test_mode(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids jsonb;
  v_arr uuid[];
begin
  select coalesce(test_data_ids, '{}'::jsonb) into v_ids from companies where id = p_company_id;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'quotes', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from quotes where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'purchase_orders', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from purchase_orders where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'bills', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from bills where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'invoices', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from invoices where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'travel_logs', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from travel_logs where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'jobs', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from jobs where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'enquiries', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from enquiries where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'projects', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from projects where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'customers', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from customers where id = any(v_arr) and company_id = p_company_id; end if;

  v_arr := array(select jsonb_array_elements_text(coalesce(v_ids->'suppliers', '[]')))::uuid[];
  if array_length(v_arr, 1) > 0 then delete from suppliers where id = any(v_arr) and company_id = p_company_id; end if;

  update companies set test_mode = false, test_data_ids = '{}'::jsonb where id = p_company_id;
end;
$$;

revoke all on function public.disable_test_mode(uuid) from public;
revoke all on function public.disable_test_mode(uuid) from anon, authenticated;
grant execute on function public.disable_test_mode(uuid) to service_role;
