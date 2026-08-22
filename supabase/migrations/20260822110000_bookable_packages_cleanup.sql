-- bookable_packages had two columns nothing in the app ever reads or writes:
-- public_slug (the public booking route uses packageId, never slug — grepped
-- the whole tradiee-app tree, zero references) and category (never rendered,
-- filtered, or grouped by anywhere). Dropping rather than building UI for
-- fields with no consumer on the read side either — that would just be a
-- different flavour of the same "disconnected" problem.
--
-- The other flagged columns (deposit_amount, deposit_percent,
-- requires_deposit, auto_confirm, creates_job, creates_invoice,
-- recurring_interval_months, buffer_before_minutes, buffer_after_minutes)
-- ARE read by real logic (app/api/bookings/create/route.ts,
-- app/api/reminders/route.ts, lib/bookings/availability.ts) — those get an
-- edit UI instead, in the same commit.
alter table bookable_packages drop column if exists public_slug;
alter table bookable_packages drop column if exists category;
