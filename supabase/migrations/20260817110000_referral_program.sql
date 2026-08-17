-- Customer-referral program: refer a paying friend, get up to 3 free months
-- (Stripe customer-balance credit, amount = referrer's own plan price) as
-- each of their friend's first 3 payments lands. Multiple referred friends
-- stack independently. See app/api/stripe/webhook/route.ts's new
-- 'invoice.paid' case for the reward mechanics.

alter table companies
  add column if not exists referral_code text unique,
  add column if not exists referred_by_company_id uuid references companies(id);
comment on column companies.referral_code is
  'Short code shown to this company to share with friends (?ref=<code> at signup). Generated at signup, app-side.';
comment on column companies.referred_by_company_id is
  'Set once at signup if a valid referral_code was supplied; never changed after. Null if not referred.';

-- Ledger of earned referral credits. Service-role-write-only (the webhook is
-- the only writer) — same shape as sms_usage_events
-- (20260707211441_billing_addons_sms_usage.sql), the closest existing analog:
-- company-scoped, a Stripe-id dedup column, no client insert/update policy.
create table referral_credits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade, -- the referrer, who earns the credit
  referred_company_id uuid not null references companies(id) on delete cascade, -- the paying friend
  stripe_invoice_id text not null unique, -- idempotency: one credit per unique friend invoice, survives webhook redelivery
  month_number smallint not null check (month_number between 1 and 3), -- which of the friend's first 3 qualifying payments this is
  amount_cents integer not null,
  currency text not null,
  stripe_credit_applied boolean not null default false, -- false until the Stripe balance call actually succeeds
  created_at timestamptz not null default now(),
  unique (referred_company_id, month_number) -- atomic cap-enforcement: this row is the slot, claimed before the Stripe call
);
create index idx_referral_credits_company on referral_credits(company_id);
create index idx_referral_credits_referred_company on referral_credits(referred_company_id);

alter table referral_credits enable row level security;
revoke all on referral_credits from public, anon, authenticated;
grant all on referral_credits to service_role;
-- Referrers can see their own earned credits (Settings → Referrals tab).
create policy "referrers can view their own credits" on referral_credits
  for select using (company_id = current_company_id());
grant select on referral_credits to authenticated;
