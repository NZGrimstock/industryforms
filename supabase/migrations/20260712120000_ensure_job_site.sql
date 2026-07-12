-- Every job should have a job site. Rather than a hard NOT NULL (which would
-- break the existing title-only/no-customer quick-create paths), auto-attach
-- a site on insert when the caller didn't pick one: reuse an existing site
-- matching the customer's billing address, or create one from it. Jobs with
-- no customer_id (or a customer with no billing_address) are left alone —
-- there's nothing to derive an address from.
create or replace function ensure_job_site() returns trigger as $$
declare
  v_billing_address text;
  v_existing_site_id uuid;
begin
  if new.site_id is null and new.customer_id is not null then
    select billing_address into v_billing_address
    from customers where id = new.customer_id;

    if v_billing_address is not null and trim(v_billing_address) <> '' then
      select id into v_existing_site_id
      from customer_sites
      where customer_id = new.customer_id and address = v_billing_address
      order by created_at asc
      limit 1;

      if v_existing_site_id is not null then
        new.site_id := v_existing_site_id;
      else
        insert into customer_sites (customer_id, label, address)
        values (new.customer_id, 'Billing address', v_billing_address)
        returning id into new.site_id;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists jobs_ensure_site on jobs;
create trigger jobs_ensure_site
  before insert on jobs
  for each row execute function ensure_job_site();
