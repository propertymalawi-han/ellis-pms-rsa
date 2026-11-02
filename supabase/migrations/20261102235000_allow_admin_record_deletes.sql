-- Owners and partners can delete any tenant invoice, including sent and paid
-- ones. Payments and line items go with the invoice. Unpaid drafts stay
-- deletable by anyone who can access the property.
--
-- Deleting a rates and levies bill must also remove the expenses it created.
-- The expense guard blocks that unless the bill sync flag is on, so a before
-- delete trigger sets the flag for the rest of the statement.

create or replace function private.rates_levies_bills_mark_deleting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('private.bill_sync', 'on', true);
  return old;
end;
$$;

drop trigger if exists rates_levies_bills_mark_deleting on public.rates_levies_bills;

create trigger rates_levies_bills_mark_deleting
  before delete on public.rates_levies_bills
  for each row execute function private.rates_levies_bills_mark_deleting();

revoke all on function private.rates_levies_bills_mark_deleting() from public, anon;
grant execute on function private.rates_levies_bills_mark_deleting() to authenticated, service_role;

comment on function private.rates_levies_bills_mark_deleting() is
  'Lets the linked expenses be removed when their rates and levies bill is deleted.';

alter table public.payments
  drop constraint payments_invoice_id_fkey;

alter table public.payments
  add constraint payments_invoice_id_fkey
  foreign key (invoice_id)
  references public.invoices (id)
  on delete cascade;

drop policy invoices_delete on public.invoices;

create policy invoices_delete
  on public.invoices
  for delete
  to authenticated
  using (
    (select private.can_access_property(property_id))
    and (
      (issued = false and amount_paid = 0)
      or (select private.is_admin())
    )
  );

comment on policy invoices_delete on public.invoices is
  'Anyone who can access the property may delete an unpaid draft. Owners and partners may delete any invoice.';
