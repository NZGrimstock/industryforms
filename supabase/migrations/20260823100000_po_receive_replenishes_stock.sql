-- Symmetric counterpart to consume_price_list_stock() (20260708103000): marking
-- a purchase order "received" should put stock back on the shelf for any line
-- item linked to a tracked price_list_item, the same way completing a job's
-- materials consumes it. Full-receive only (PO has no partial-receive UI) —
-- ponytail: whole-PO quantities go back in one shot, no per-line partial
-- receipt; add a received_quantity column + UI if partial receiving matters.
create or replace function public.replenish_price_list_stock(p_company_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
begin
  if p_company_id <> public.current_company_id() then
    raise exception 'stock adjustment company mismatch';
  end if;

  for v_line in
    select item_id::uuid as item_id, sum(quantity)::numeric as quantity
    from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity numeric)
    where item_id is not null and quantity > 0
    group by item_id
  loop
    update public.price_list_items
      set quantity_on_hand = quantity_on_hand + v_line.quantity
      where id = v_line.item_id
        and company_id = p_company_id
        and quantity_on_hand is not null;
  end loop;
end;
$$;

grant execute on function public.replenish_price_list_stock(uuid, jsonb) to authenticated;
