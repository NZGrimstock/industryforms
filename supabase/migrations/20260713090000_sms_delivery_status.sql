-- Twilio status-callback support: tracks delivered/failed/undelivered per
-- outbound message, separate from customer_messages.status (open/pending/
-- closed/spam triage state — unrelated meaning, don't conflate).
alter table customer_messages
  add column if not exists delivery_status text;

create index if not exists customer_messages_twilio_sid_idx
  on customer_messages(twilio_sid) where twilio_sid is not null;
