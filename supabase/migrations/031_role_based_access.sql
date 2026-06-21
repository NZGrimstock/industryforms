-- Role-based visibility for multi-seat accounts.
--
-- Until now every company member could read all company data. This scopes the
-- field-staff role: a 'staff' user sees only jobs assigned to them (and those
-- jobs' notes/photos/materials/visits), plus their own timesheets and travel.
-- Financial + sales data (quotes, invoices, payments, suppliers, purchase
-- orders, bills, enquiries) becomes owner/admin-only.
--
-- Owners and admins are unaffected: is_admin_or_owner() short-circuits every
-- check to the previous company-wide behaviour. Solo tradies are owners, so
-- they keep seeing everything.

-- ── Jobs: staff see + edit only their assigned jobs ──────────────────────────
drop policy "company members select jobs" on jobs;
create policy "members select jobs" on jobs
  for select using (
    company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  );

drop policy "company members write jobs" on jobs;
create policy "members write jobs" on jobs
  for all using (
    company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ) with check (company_id = current_company_id());

-- ── Job children: visible when the parent job is visible ─────────────────────
drop policy "company members select visits" on job_visits;
create policy "members select visits" on job_visits
  for select using (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ));

drop policy "company members select job notes" on job_notes;
create policy "members select job notes" on job_notes
  for select using (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ));

drop policy "company members select job photos" on job_photos;
create policy "members select job photos" on job_photos
  for select using (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ));

drop policy "company members can view job_materials" on job_materials;
create policy "members view job_materials" on job_materials
  for select using (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ));

-- ── Timesheets & travel: staff see only their own ────────────────────────────
drop policy "company members select timesheets" on timesheets;
create policy "members select timesheets" on timesheets
  for select using (
    company_id = current_company_id()
    and (is_admin_or_owner() or profile_id = auth.uid())
  );

drop policy "travel_logs_company_access" on travel_logs;
create policy "travel_logs_access" on travel_logs
  for all using (
    company_id = current_company_id()
    and (is_admin_or_owner() or profile_id = auth.uid())
  ) with check (
    company_id = current_company_id()
    and (is_admin_or_owner() or profile_id = auth.uid())
  );

-- ── Quotes (+children): owner/admin only ─────────────────────────────────────
drop policy "company members select quotes" on quotes;
create policy "admins select quotes" on quotes
  for select using (company_id = current_company_id() and is_admin_or_owner());
drop policy "company members write quotes" on quotes;
create policy "admins write quotes" on quotes
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

drop policy "company members select quote sections" on quote_sections;
create policy "admins select quote sections" on quote_sections
  for select using (quote_id in (select id from quotes where company_id = current_company_id() and is_admin_or_owner()));
drop policy "company members select quote line items" on quote_line_items;
create policy "admins select quote line items" on quote_line_items
  for select using (quote_id in (select id from quotes where company_id = current_company_id() and is_admin_or_owner()));

-- ── Invoices (+line items), payments: owner/admin only ───────────────────────
drop policy "company members select invoices" on invoices;
create policy "admins select invoices" on invoices
  for select using (company_id = current_company_id() and is_admin_or_owner());
drop policy "company members select invoice line items" on invoice_line_items;
create policy "admins select invoice line items" on invoice_line_items
  for select using (invoice_id in (select id from invoices where company_id = current_company_id() and is_admin_or_owner()));
drop policy "company members select payments" on payments;
create policy "admins select payments" on payments
  for select using (invoice_id in (select id from invoices where company_id = current_company_id() and is_admin_or_owner()));

-- ── Procurement: owner/admin only ────────────────────────────────────────────
drop policy "company members manage suppliers" on suppliers;
create policy "admins manage suppliers" on suppliers
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());
drop policy "company members manage purchase_orders" on purchase_orders;
create policy "admins manage purchase_orders" on purchase_orders
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());
drop policy "company members manage purchase_order_items" on purchase_order_items;
create policy "admins manage purchase_order_items" on purchase_order_items
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());
drop policy "company members manage bills" on bills;
create policy "admins manage bills" on bills
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- ── Enquiries: owner/admin view only (sales pipeline) ────────────────────────
drop policy "company members can view enquiries" on enquiries;
create policy "admins view enquiries" on enquiries
  for select using (company_id = current_company_id() and is_admin_or_owner());
