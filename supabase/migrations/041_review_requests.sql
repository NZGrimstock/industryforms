-- Review request automation — sent once on invoice paid.
--
-- review_link            Google / Yelp / Facebook review URL to send customers to.
-- review_request_enabled Owner can disable the automation without clearing the link.
-- review_request_sent_at On the invoice — set after a successful send so we never
--                        double-trigger (manual mark-paid + Stripe webhook race).

alter table companies
  add column if not exists review_link text,
  add column if not exists review_request_enabled boolean not null default true;

alter table invoices
  add column if not exists review_request_sent_at timestamptz;

comment on column companies.review_link is
  'Public URL the customer is sent to after paying (e.g. Google review URL).';
