-- Per-user stamp so the Tap to Pay on iPhone launch push (Apple review
-- requirement 6.3: "an in-app push notification must be deployed to all
-- eligible users") is sent to each eligible merchant at most once, while
-- staying re-runnable for merchants who become eligible later.
alter table public.profiles
  add column if not exists tap_to_pay_launch_push_at timestamptz;
