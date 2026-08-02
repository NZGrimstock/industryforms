-- Purchase orders raised from a job carry the job number as their reference so
-- it shows on the emailed PO. The reverse link (job -> its PO numbers) is
-- derived from the existing purchase_orders.job_id FK, so no column is needed
-- on jobs.
alter table purchase_orders add column if not exists reference text;
