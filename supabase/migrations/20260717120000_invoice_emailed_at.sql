-- Distinct from sent_at (also set by "Complete invoice", which finalises
-- without emailing) so the UI can show whether the customer was actually
-- emailed a copy.
alter table invoices add column if not exists emailed_at timestamptz;
