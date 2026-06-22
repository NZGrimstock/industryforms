-- Per-company theme accent — overrides the orange fallback on unscoped routes
-- and the global "+ New" / brand chrome. Suggested automatically on logo
-- upload (Settings → Company) and can be manually overridden.
--
-- Stored as a CSS hex string (e.g. '#0284c7'). Null means "use default orange".

alter table companies
  add column if not exists theme_accent text;

comment on column companies.theme_accent is
  'Optional brand accent hex (e.g. #0284c7). Falls back to orange when null.';
