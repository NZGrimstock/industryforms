-- Optional recurring reminder for the customer statement run (Statements
-- page). This only stores a schedule; the daily cron in /api/reminders emails
-- the owner/admins a nudge when due, it never sends statements unattended —
-- a human always reviews and ticks/unticks before anything goes out.
alter table companies
  add column statement_run_interval text
    check (statement_run_interval in ('weekly', 'fortnightly', 'monthly', 'quarterly')),
  add column statement_run_next date;
