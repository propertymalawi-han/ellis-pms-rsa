-- Rates and levies bills entered by hand. The bill file and proof of payment
-- live in the private bills bucket and are only a reference while the amounts
-- are typed in. A bill may be saved with no file and the document attached
-- later. Anyone who can access the property can read and write its bills.
-- Deletes are limited to owners and partners.
--
-- Saving a bill creates or updates the matching expenses so totals and ROI
-- stay in step without typing the same amounts again:
--   levy              -> Levies
--   special_levy      -> Special levy
--   municipal_rates   -> Municipal rates
--   water+electricity -> Water & electricity
--   refuse, sewerage, other_charges and interest -> Other
-- Arrears are a prior balance, so they stay on the bill and are not copied.
-- Those expense rows are linked by rates_levies_bill_id and cannot be edited
-- on their own.

create type public.bill_type as enum ('levy', 'municipal', 'combined');

create type public.bill_status as enum ('due', 'paid', 'overdue');

create table public.rates_levies_bills (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  bill_type public.bill_type not null,
  issuer_name text not null,
  account_number text,
  period_month date not null,
  statement_date date,
  due_date date not null,
  levy numeric(14, 2) not null default 0,
  special_levy numeric(14, 2) not null default 0,
  municipal_rates numeric(14, 2) not null default 0,
  water numeric(14, 2) not null default 0,
  electricity numeric(14, 2) not null default 0,
  refuse numeric(14, 2) not null default 0,
  sewerage numeric(14, 2) not null default 0,
  other_charges numeric(14, 2) not null default 0,
  arrears numeric(14, 2) not null default 0,
  interest numeric(14, 2) not null default 0,
  total_due numeric(14, 2) not null,
  amount_paid numeric(14, 2),
  paid_date date,
  status public.bill_status not null default 'due',
  file_path text,
  proof_file_path text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rates_levies_bills_property_period_type_key unique (property_id, period_month, bill_type),
  constraint rates_levies_bills_period_month_start check (
    period_month = (date_trunc('month', period_month::timestamp))::date
  ),
  constraint rates_levies_bills_amounts_nonnegative check (
    levy >= 0
    and special_levy >= 0
    and municipal_rates >= 0
    and water >= 0
    and electricity >= 0
    and refuse >= 0
    and sewerage >= 0
    and other_charges >= 0
    and arrears >= 0
    and interest >= 0
    and total_due >= 0
    and (amount_paid is null or amount_paid >= 0)
  ),
  constraint rates_levies_bills_paid_fields check (
    (
      status = 'paid'
      and paid_date is not null
      and amount_paid is not null
    )
    or (
      status <> 'paid'
      and paid_date is null
      and amount_paid is null
      and proof_file_path is null
    )
  ),
  constraint rates_levies_bills_issuer_length check (char_length(issuer_name) between 1 and 200),
  constraint rates_levies_bills_account_length check (
    account_number is null or char_length(account_number) between 1 and 100
  ),
  constraint rates_levies_bills_files_distinct check (
    file_path is null
    or proof_file_path is null
    or file_path <> proof_file_path
  ),
  constraint rates_levies_bills_file_path_shape check (
    file_path is null
    or (
      file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
      and lower(split_part(file_path, '/', 1)) = property_id::text
    )
  ),
  constraint rates_levies_bills_proof_file_path_shape check (
    proof_file_path is null
    or (
      proof_file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
      and lower(split_part(proof_file_path, '/', 1)) = property_id::text
    )
  )
);

create unique index rates_levies_bills_file_path_key
  on public.rates_levies_bills (file_path)
  where file_path is not null;

create unique index rates_levies_bills_proof_file_path_key
  on public.rates_levies_bills (proof_file_path)
  where proof_file_path is not null;

create index rates_levies_bills_uploaded_by_idx
  on public.rates_levies_bills (uploaded_by);

comment on table public.rates_levies_bills is
  'Municipal and body corporate bills. Amounts are typed in by hand. The file is optional and stored in the bills bucket.';

comment on column public.rates_levies_bills.issuer_name is
  'Body corporate or municipality that issued the bill.';

comment on column public.rates_levies_bills.arrears is
  'Balance brought forward. Not copied to expenses, so an earlier period is not counted twice.';

alter table public.expenses
  add column rates_levies_bill_id uuid references public.rates_levies_bills (id) on delete cascade;

create unique index expenses_bill_category_key
  on public.expenses (rates_levies_bill_id, category_id)
  where rates_levies_bill_id is not null;

comment on column public.expenses.rates_levies_bill_id is
  'Set when this expense was created from a rates and levies bill. The bill is the source of the amounts.';

-- ---------------------------------------------------------------------------
-- Row guards
-- ---------------------------------------------------------------------------

create or replace function private.bill_file_linked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rates_levies_bills as bill
    where bill.file_path = object_name
      or bill.proof_file_path = object_name
  );
$$;

create or replace function private.remove_unlinked_expense_file(object_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if not private.can_access_object('bills', object_path) then
    raise exception 'Expense file not found'
      using errcode = '42501';
  end if;

  if private.expense_file_linked(object_path) then
    raise exception 'Expense file is already saved'
      using errcode = '42501';
  end if;

  if private.bill_file_linked(object_path) then
    raise exception 'Bill file is already saved'
      using errcode = '42501';
  end if;

  delete from storage.objects as obj
  where obj.bucket_id = 'bills'
    and obj.name = object_path
    and obj.owner = (select auth.uid());

  if not found then
    raise exception 'Expense file not found'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.rates_levies_bills_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.uploaded_by := (select auth.uid());
    end if;
  elsif new.id is distinct from old.id
    or new.property_id is distinct from old.property_id
    or new.uploaded_by is distinct from old.uploaded_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'This bill cannot be moved'
      using errcode = '42501';
  end if;

  new.issuer_name := btrim(new.issuer_name);

  if new.account_number is not null then
    new.account_number := nullif(btrim(new.account_number), '');
  end if;

  if new.issuer_name is null or char_length(new.issuer_name) = 0 then
    raise exception 'Enter the issuer name'
      using errcode = '23514';
  end if;

  if new.paid_date is not null then
    if new.amount_paid is null then
      raise exception 'Enter the amount paid'
        using errcode = '23514';
    end if;

    new.status := 'paid';
  else
    new.amount_paid := null;
    new.proof_file_path := null;

    if not (new.due_date > ((timezone('Africa/Johannesburg', now()))::date - 1)) then
      new.status := 'overdue';
    else
      new.status := 'due';
    end if;
  end if;

  if new.file_path is not null
    and lower(split_part(new.file_path, '/', 1)) is distinct from new.property_id::text
  then
    raise exception 'Bill file does not belong to this property'
      using errcode = '23514';
  end if;

  if new.proof_file_path is not null
    and lower(split_part(new.proof_file_path, '/', 1)) is distinct from new.property_id::text
  then
    raise exception 'Proof of payment does not belong to this property'
      using errcode = '23514';
  end if;

  if new.file_path is not null and exists (
    select 1
    from public.rates_levies_bills as bill
    where bill.id is distinct from new.id
      and (
        bill.file_path = new.file_path
        or bill.proof_file_path = new.file_path
      )
  ) then
    raise exception 'That bill file is already saved'
      using errcode = '23505';
  end if;

  if new.proof_file_path is not null and exists (
    select 1
    from public.rates_levies_bills as bill
    where bill.id is distinct from new.id
      and (
        bill.file_path = new.proof_file_path
        or bill.proof_file_path = new.proof_file_path
      )
  ) then
    raise exception 'That proof of payment is already saved'
      using errcode = '23505';
  end if;

  if new.file_path is not null and exists (
    select 1
    from public.expenses as expense
    where expense.file_path = new.file_path
      or expense.proof_file_path = new.file_path
  ) then
    raise exception 'That bill file is already saved'
      using errcode = '23505';
  end if;

  if new.proof_file_path is not null and exists (
    select 1
    from public.expenses as expense
    where expense.file_path = new.proof_file_path
      or expense.proof_file_path = new.proof_file_path
  ) then
    raise exception 'That proof of payment is already saved'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function private.sync_bill_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_category_id uuid;
  v_existing_id uuid;
  v_description text;
  v_paid boolean;
  v_paid_amount numeric(14, 2);
  v_month_label text;
begin
  if new.water + new.electricity > 999999999999.99
    or new.refuse + new.sewerage + new.other_charges + new.interest > 999999999999.99
  then
    raise exception 'Those bill amounts are too large to record as one expense'
      using errcode = '23514';
  end if;

  perform set_config('private.bill_sync', 'on', true);

  v_paid := new.paid_date is not null;
  v_month_label := trim(to_char(new.period_month, 'FMMonth YYYY'));

  for v_line in
    select line.category_name, line.amount, line.detail
    from (
      values
        ('Levies'::text, new.levy, 'Levy'::text),
        ('Special levy', new.special_levy, 'Special levy'),
        ('Municipal rates', new.municipal_rates, 'Municipal rates'),
        (
          'Water & electricity',
          new.water + new.electricity,
          case
            when new.water <> 0 and new.electricity <> 0 then 'Water and electricity'
            when new.electricity <> 0 then 'Electricity'
            else 'Water'
          end
        ),
        (
          'Other',
          new.refuse + new.sewerage + new.other_charges + new.interest,
          concat_ws(
            ', ',
            case when new.refuse <> 0 then 'Refuse' end,
            case when new.sewerage <> 0 then 'Sewerage' end,
            case when new.other_charges <> 0 then 'Other charges' end,
            case when new.interest <> 0 then 'Interest' end
          )
        )
    ) as line(category_name, amount, detail)
  loop
    if v_line.amount > 999999999999.99 then
      raise exception 'Those bill amounts are too large to record as one expense'
        using errcode = '23514';
    end if;

    select category.id
    into v_category_id
    from public.expense_categories as category
    where category.name = v_line.category_name;

    if v_category_id is null then
      raise exception 'Expense category % is missing', v_line.category_name
        using errcode = '23514';
    end if;

    select expense.id
    into v_existing_id
    from public.expenses as expense
    where expense.rates_levies_bill_id = new.id
      and expense.category_id = v_category_id;

    if v_line.amount = 0 then
      if v_existing_id is not null then
        delete from public.expenses as expense
        where expense.id = v_existing_id;
      end if;

      continue;
    end if;

    v_description := v_month_label || ' — ' || v_line.detail;
    v_paid_amount := case when v_paid then v_line.amount else null end;

    if v_existing_id is null then
      insert into public.expenses (
        property_id,
        category_id,
        supplier,
        description,
        invoice_number,
        invoice_date,
        amount_excl_vat,
        vat_amount,
        total,
        due_date,
        paid_date,
        amount_paid,
        status,
        recurring,
        rates_levies_bill_id
      )
      values (
        new.property_id,
        v_category_id,
        new.issuer_name,
        v_description,
        new.account_number,
        new.statement_date,
        v_line.amount,
        0,
        v_line.amount,
        new.due_date,
        case when v_paid then new.paid_date else null end,
        v_paid_amount,
        'due',
        false,
        new.id
      );

      continue;
    end if;

    if exists (
      select 1
      from public.expenses as expense
      where expense.id = v_existing_id
        and expense.supplier is not distinct from new.issuer_name
        and expense.description is not distinct from v_description
        and expense.invoice_number is not distinct from new.account_number
        and expense.invoice_date is not distinct from new.statement_date
        and expense.amount_excl_vat = v_line.amount
        and expense.vat_amount = 0
        and expense.total = v_line.amount
        and expense.due_date = new.due_date
        and expense.paid_date is not distinct from (case when v_paid then new.paid_date else null end)
        and expense.amount_paid is not distinct from v_paid_amount
        and expense.recurring = false
        and expense.recurrence is null
        and expense.payment_method is null
        and expense.file_path is null
        and expense.proof_file_path is null
    ) then
      continue;
    end if;

    update public.expenses as expense
    set
      supplier = new.issuer_name,
      description = v_description,
      invoice_number = new.account_number,
      invoice_date = new.statement_date,
      amount_excl_vat = v_line.amount,
      vat_amount = 0,
      total = v_line.amount,
      due_date = new.due_date,
      paid_date = case when v_paid then new.paid_date else null end,
      amount_paid = v_paid_amount,
      payment_method = null,
      recurring = false,
      recurrence = null,
      file_path = null,
      proof_file_path = null
    where expense.id = v_existing_id;
  end loop;

  perform set_config('private.bill_sync', 'off', true);

  return new;
end;
$$;

create or replace function private.expenses_bill_link_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.rates_levies_bill_id is not null
      and current_setting('private.bill_sync', true) is distinct from 'on'
      and exists (
        select 1
        from public.rates_levies_bills as bill
        where bill.id = old.rates_levies_bill_id
      )
    then
      raise exception 'This expense is kept in step with its rates and levies bill'
        using errcode = '42501';
    end if;

    return old;
  end if;

  if current_setting('private.bill_sync', true) is distinct from 'on'
    and (
      new.rates_levies_bill_id is not null
      or (tg_op = 'UPDATE' and old.rates_levies_bill_id is not null)
    )
  then
    raise exception 'This expense is kept in step with its rates and levies bill'
      using errcode = '42501';
  end if;

  if new.file_path is not null and exists (
    select 1
    from public.rates_levies_bills as bill
    where bill.file_path = new.file_path
      or bill.proof_file_path = new.file_path
  ) then
    raise exception 'That invoice file is already saved'
      using errcode = '23505';
  end if;

  if new.proof_file_path is not null and exists (
    select 1
    from public.rates_levies_bills as bill
    where bill.file_path = new.proof_file_path
      or bill.proof_file_path = new.proof_file_path
  ) then
    raise exception 'That proof of payment is already saved'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function private.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_entity_id uuid;
  v_property_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
    v_row := v_old;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
  else
    v_old := null;
    v_new := to_jsonb(new);
    v_row := v_new;
  end if;

  if tg_table_name = 'properties' then
    v_entity_id := (v_row ->> 'id')::uuid;
    v_property_id := v_entity_id;
  elsif tg_table_name in (
    'documents',
    'leases',
    'invoices',
    'owner_statements',
    'expenses',
    'rates_levies_bills'
  ) then
    v_entity_id := (v_row ->> 'id')::uuid;
    v_property_id := (v_row ->> 'property_id')::uuid;
  elsif tg_table_name = 'property_access' then
    v_entity_id := (v_row ->> 'property_id')::uuid;
    v_property_id := v_entity_id;
  elsif tg_table_name in ('profiles', 'tenants', 'business_settings') then
    v_entity_id := case
      when tg_table_name = 'business_settings' then null
      else (v_row ->> 'id')::uuid
    end;
    v_property_id := null;
  elsif tg_table_name in ('invoice_items', 'payments') then
    v_entity_id := (v_row ->> 'id')::uuid;
    select invoice.property_id
    into v_property_id
    from public.invoices as invoice
    where invoice.id = (v_row ->> 'invoice_id')::uuid;
  else
    v_entity_id := null;
    v_property_id := null;
  end if;

  if v_property_id is not null
    and not exists (
      select 1
      from public.properties as property
      where property.id = v_property_id
    )
  then
    v_property_id := null;
  end if;

  insert into public.activity_log (
    user_id,
    action,
    entity_type,
    entity_id,
    property_id,
    details
  )
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    v_property_id,
    jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new))
  );

  return coalesce(new, old);
end;
$$;

create trigger rates_levies_bills_prepare
  before insert or update on public.rates_levies_bills
  for each row execute function private.rates_levies_bills_prepare();

create trigger rates_levies_bills_set_updated_at
  before update on public.rates_levies_bills
  for each row execute function private.set_updated_at();

create trigger rates_levies_bills_sync_expenses
  after insert or update on public.rates_levies_bills
  for each row execute function private.sync_bill_expenses();

create trigger rates_levies_bills_log_activity
  after insert or update or delete on public.rates_levies_bills
  for each row execute function private.log_activity();

create trigger expenses_bill_link_guard
  before insert or update or delete on public.expenses
  for each row execute function private.expenses_bill_link_guard();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.bill_file_linked(text) from public, anon;
revoke all on function private.rates_levies_bills_prepare() from public, anon;
revoke all on function private.sync_bill_expenses() from public, anon;
revoke all on function private.expenses_bill_link_guard() from public, anon;

grant execute on function private.bill_file_linked(text) to authenticated, service_role;
grant execute on function private.rates_levies_bills_prepare() to authenticated, service_role;
grant execute on function private.sync_bill_expenses() to authenticated, service_role;
grant execute on function private.expenses_bill_link_guard() to authenticated, service_role;

revoke all on table public.rates_levies_bills from public, anon;
grant select, insert, delete on table public.rates_levies_bills to authenticated, service_role;
grant update (
  bill_type,
  issuer_name,
  account_number,
  period_month,
  statement_date,
  due_date,
  levy,
  special_levy,
  municipal_rates,
  water,
  electricity,
  refuse,
  sewerage,
  other_charges,
  arrears,
  interest,
  total_due,
  amount_paid,
  paid_date,
  status,
  file_path,
  proof_file_path,
  updated_at
) on table public.rates_levies_bills to authenticated;
grant update on table public.rates_levies_bills to service_role;

comment on function private.sync_bill_expenses() is
  'Creates or updates the expenses linked to a rates and levies bill. Arrears are not copied.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.rates_levies_bills enable row level security;

create policy rates_levies_bills_select
  on public.rates_levies_bills
  for select
  to authenticated
  using ((select private.can_access_property(property_id)));

create policy rates_levies_bills_insert
  on public.rates_levies_bills
  for insert
  to authenticated
  with check ((select private.can_access_property(property_id)));

create policy rates_levies_bills_update
  on public.rates_levies_bills
  for update
  to authenticated
  using ((select private.can_access_property(property_id)))
  with check ((select private.can_access_property(property_id)));

create policy rates_levies_bills_delete
  on public.rates_levies_bills
  for delete
  to authenticated
  using (
    (select private.is_admin())
    and (select private.can_access_property(property_id))
  );

drop policy activity_log_select on public.activity_log;

create policy activity_log_select
  on public.activity_log
  for select
  to authenticated
  using (
    (select private.is_admin())
    or (
      property_id is not null
      and entity_type in (
        'documents',
        'property_access',
        'leases',
        'invoices',
        'invoice_items',
        'payments',
        'owner_statements',
        'expenses',
        'rates_levies_bills'
      )
      and (select private.can_access_property(property_id))
    )
  );

-- A bill file stays put once a bill points at it. An unlinked upload can
-- still be removed by someone who can access the property.
drop policy property_files_delete on storage.objects;

create policy property_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    (select private.can_access_object(bucket_id, name))
    and (
      (
        bucket_id != 'property-documents'
        and bucket_id != 'statements'
        and bucket_id != 'bills'
      )
      or (select private.is_admin())
      or (
        bucket_id = 'statements'
        and not (select private.statement_file_linked(name))
      )
      or (
        bucket_id = 'bills'
        and not (select private.expense_file_linked(name))
        and not (select private.bill_file_linked(name))
      )
    )
  );
