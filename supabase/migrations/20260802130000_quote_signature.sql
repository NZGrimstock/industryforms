-- Customers sign the quote before it can be accepted. The drawn signature is
-- stored in R2 (public bucket) and referenced here, alongside who signed and when.
alter table quotes
  add column if not exists signature_url text,
  add column if not exists signed_by_name text,
  add column if not exists signed_at timestamptz;
