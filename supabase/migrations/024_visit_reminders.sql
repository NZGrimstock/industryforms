-- Track when an appointment reminder was sent for a scheduled visit, so the
-- reminders cron doesn't text/email the customer twice.
alter table job_visits add column if not exists reminder_sent_at timestamptz;
