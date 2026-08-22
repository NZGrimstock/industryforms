-- Extends the free-plan row-cap trigger (20260817100000_free_plan_row_caps.sql)
-- to price_list_items ("stock items"): free plan is capped at 50, mirroring
-- lib/plans.ts's maxStockItems. Same BEFORE INSERT, existing-rows-untouched
-- semantics as the jobs/customers caps — a company that drops from trial to
-- free with 200 items keeps all 200, they just can't add a 201st until they
-- delete down or upgrade.
create or replace function enforce_plan_row_cap() returns trigger as $$
declare
  v_kind text := TG_ARGV[0];
  v_label text := TG_ARGV[1];
  v_cap integer;
  v_count integer;
begin
  perform 1 from companies where id = new.company_id for update;

  if company_effective_plan(new.company_id) <> 'free' then
    return new;
  end if;

  if v_kind = 'jobs' then
    v_cap := 3;
    select count(*) into v_count from jobs j
      where j.company_id = new.company_id
        and not exists (
          select 1 from job_statuses js
          where js.company_id = j.company_id and js.key = j.status and js.is_terminal
        )
        and (
          exists (select 1 from job_statuses js where js.company_id = j.company_id and js.key = j.status)
          or j.status not in ('completed', 'cancelled')
        );
  elsif v_kind = 'customers' then
    v_cap := 10;
    select count(*) into v_count from customers where company_id = new.company_id;
  elsif v_kind = 'price_list_items' then
    v_cap := 50;
    select count(*) into v_count from price_list_items where company_id = new.company_id;
  else
    raise exception 'enforce_plan_row_cap: unknown kind %', v_kind;
  end if;

  if v_count >= v_cap then
    raise exception 'Free plan is capped at % % — upgrade to add more.', v_cap, v_label
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists cap_free_plan_price_list_items on price_list_items;
create trigger cap_free_plan_price_list_items
  before insert on price_list_items
  for each row execute function enforce_plan_row_cap('price_list_items', 'stock items');
