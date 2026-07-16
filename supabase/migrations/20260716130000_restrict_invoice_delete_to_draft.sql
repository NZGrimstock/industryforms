-- Only draft invoices can be deleted. Once an invoice is sent (or has a
-- payment recorded), its number is a real document the customer has seen —
-- deleting it would leave a silent gap in the numbering audit trail
-- (undermining the unique-numbering guarantee added in 20260716120000).
-- The UI already hides the delete button for non-drafts; this closes the
-- same gap at the RLS layer so it can't be bypassed via a direct API call.

drop policy if exists "admins write invoices" on invoices;

create policy "admins insert invoices" on invoices
  for insert with check (company_id = current_company_id() and is_admin_or_owner());

create policy "admins update invoices" on invoices
  for update using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

create policy "admins delete draft invoices" on invoices
  for delete using (company_id = current_company_id() and is_admin_or_owner() and status = 'draft');
