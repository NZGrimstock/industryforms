-- Discounts on quotes & invoices: per-line-item and document-level, each $ or %.
--
-- Convention: `line_total` stays NET (after any line discount) so every existing
-- `subtotal = sum(line_total)` calculation keeps working untouched. The
-- document-level discount is applied to the subtotal *before* GST and stored on
-- the parent row as both the entered type/value and the resolved $ amount.

-- Line-item discounts
alter table quote_line_items
  add column if not exists discount_type  text,                       -- 'amount' | 'percent' | null
  add column if not exists discount_value numeric(12,2) not null default 0;
alter table invoice_line_items
  add column if not exists discount_type  text,
  add column if not exists discount_value numeric(12,2) not null default 0;

-- Document-level discounts
alter table quotes
  add column if not exists discount_type   text,
  add column if not exists discount_value  numeric(12,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0;
alter table invoices
  add column if not exists discount_type   text,
  add column if not exists discount_value  numeric(12,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0;
