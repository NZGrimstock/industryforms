-- Structured material -> supplier link (was free-text price_list_items.supplier_name)
-- so an accepted quote's parts can be auto-split into one PO per supplier.
-- Also tag POs with the quote they were generated from (traceability + idempotency).
alter table price_list_items add column if not exists supplier_id uuid references suppliers(id) on delete set null;
alter table purchase_orders add column if not exists quote_id uuid references quotes(id) on delete set null;

create index if not exists price_list_items_supplier_idx on price_list_items(supplier_id);
create index if not exists purchase_orders_quote_idx on purchase_orders(quote_id);

-- Best-effort backfill: link items whose existing free-text supplier_name matches
-- a supplier record (same company, case-insensitive). Unmatched stay null.
update price_list_items p
   set supplier_id = s.id
  from suppliers s
 where p.supplier_id is null
   and s.company_id = p.company_id
   and lower(trim(p.supplier_name)) = lower(trim(s.name));
