-- Line items could be inserted/updated/deleted on an invoice of any status —
-- the "admins write invoice line items" policy (002_rls_policies.sql) never
-- checked status. That let a sent/paid invoice's content change silently
-- after the customer has already seen or paid it, the same audit-trail gap
-- 20260716130000 closed for whole-invoice deletes. UI already guards "add"
-- (web) and "add"/"remove" (mobile) to draft-only; this closes the same gap
-- at the RLS layer so it can't be bypassed via a direct API call.

drop policy if exists "admins write invoice line items" on invoice_line_items;

create policy "admins insert invoice line items" on invoice_line_items
  for insert with check (
    invoice_id in (select id from invoices where company_id = current_company_id() and is_admin_or_owner() and status = 'draft')
  );

create policy "admins update invoice line items" on invoice_line_items
  for update using (
    invoice_id in (select id from invoices where company_id = current_company_id() and is_admin_or_owner() and status = 'draft')
  ) with check (
    invoice_id in (select id from invoices where company_id = current_company_id() and is_admin_or_owner() and status = 'draft')
  );

create policy "admins delete invoice line items" on invoice_line_items
  for delete using (
    invoice_id in (select id from invoices where company_id = current_company_id() and is_admin_or_owner() and status = 'draft')
  );
