-- Tracks the PaymentIntent behind an invoice's public pay page, mirroring
-- bookings.stripe_payment_intent_id. Lets /api/stripe/payment-intent reuse
-- an open PaymentIntent across retries/reloads instead of creating a new one
-- every time (see lib/stripe.ts getOrCreatePaymentIntent()).
--
-- No PowerSync backfill needed here — unlike other invoices columns, no
-- client query reads this one (it's server-only, via the service client in
-- the payment-intent route), and it's deliberately NOT added to either app's
-- PowerSync schema.ts for the same reason.
alter table invoices add column if not exists stripe_payment_intent_id text;
