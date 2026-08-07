-- 20260804120000 locked invoice LINE ITEMS to draft-only; the invoice's own
-- discount/total fields had no equivalent guard at either the UI or the RLS
-- layer, so a sent invoice's amount could still change after the customer
-- has already seen or paid it. Blocks discount/total edits on a non-draft
-- invoice — unless the update is itself the "revert to draft" action (status
-- flips back to draft in the same statement), which is the intended way to
-- unlock editing again.
create or replace function public.protect_sent_invoice_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status <> 'draft' and NEW.status <> 'draft' then
    if NEW.discount_type is distinct from OLD.discount_type
       or NEW.discount_value is distinct from OLD.discount_value
       or NEW.discount_amount is distinct from OLD.discount_amount
       or NEW.subtotal is distinct from OLD.subtotal
       or NEW.gst_amount is distinct from OLD.gst_amount
       or NEW.total is distinct from OLD.total
    then
      raise exception 'Cannot edit a % invoice — revert it to draft first', OLD.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_sent_invoice_financials on invoices;
create trigger trg_protect_sent_invoice_financials
before update on invoices
for each row execute function public.protect_sent_invoice_financials();
