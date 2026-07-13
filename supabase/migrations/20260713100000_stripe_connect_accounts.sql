-- Stripe Connect (Express): each company settles its customers' payments to
-- its own connected account. Distinct from companies.stripe_customer_id, which
-- is the company's *subscription* to IndustryForms (on the platform account).
alter table companies
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false;

create index if not exists companies_stripe_account_id_idx
  on companies (stripe_account_id);
