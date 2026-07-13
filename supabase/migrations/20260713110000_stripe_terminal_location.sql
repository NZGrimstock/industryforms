-- Tap to Pay direct charges require the Terminal Location + reader to live on
-- the connected account, not the platform account. One Location per company,
-- created lazily the first time they take a card-present payment.
alter table companies
  add column if not exists stripe_terminal_location_id text;
