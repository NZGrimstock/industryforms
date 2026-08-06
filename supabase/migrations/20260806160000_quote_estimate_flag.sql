-- Lets a quote be flagged as a best-guess estimate rather than a fixed quote.
-- Purely a display-label distinction — status, numbering, accept/convert-to-job
-- all stay exactly the same; only what the document calls itself changes.
alter table quotes add column is_estimate boolean not null default false;
