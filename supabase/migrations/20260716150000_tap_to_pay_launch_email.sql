-- Per-user stamp so the Tap to Pay on iPhone launch EMAIL (Apple App Review
-- requirement 6.1: launch email on day one) is sent to each eligible merchant
-- at most once, while staying re-runnable for merchants who become eligible later.
-- Mirrors tap_to_pay_launch_push_at (req 6.3).
alter table public.profiles
  add column if not exists tap_to_pay_launch_email_at timestamptz;
