-- Supplier expenses entered by hand. Invoice files and proof of payment live
-- in the private bills bucket and are only a reference while the amounts are
-- typed in. Anyone who can access the property can read and write its
-- expenses. Deletes are limited to owners and partners. Changes are written
-- to activity_log.
--
-- Stored status is refreshed on write. A past-due unpaid row is overdue.
-- The app also treats an unpaid expense as overdue once the due date has
-- passed, so a row does not wait for a later update to show in red.

create type public.expense_status as enum ('due', 'paid', 'overdue');

create type public.expense_recurrence as enum ('monthly', 'quarterly', 'annually');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null,
  constraint expense_categories_name_key unique (name),
  constraint expense_categories_sort_order_key unique (sort_order),
  constraint expense_categories_name_length check (char_length(name) between 1 and 80),
  constraint expense_categories_sort_order_positive check (sort_order > 0)
);

comment on table public.expense_categories is
  'Fixed expense categories used for SARS tax-year totals. Seeded, not edited in the app.';

insert into public.expense_categories (name, sort_order)
values
  ('Municipal rates', 1),
  ('Levies', 2),
  ('Special levy', 3),
  ('Water ' || chr(38) || ' electricity', 4),
  ('Insurance', 5),
  ('Bond interest', 6),
  ('Repairs ' || chr(38) || ' maintenance', 7),
  ('Cleaning', 8),
  ('Garden ' || chr(38) || ' pool', 9),
  ('Letting/management fees', 10),
  ('Advertising', 11),
  ('Legal ' || chr(38) || ' accounting', 12),
  ('Security', 13),
  ('Internet ' || chr(38) || ' DSTV', 14),
  ('Furniture ' || chr(38) || ' equipment (capital)', 15),
  ('Other', 16);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  category_id uuid not null references public.expense_categories (id),
  supplier text,
  description text,
  invoice_number text,
  invoice_date date,
  amount_excl_vat numeric(14, 2) not null,
  vat_amount numeric(14, 2) not null,
  total numeric(14, 2) not null,
  due_date date not null,
  paid_date date,
  amount_paid numeric(14, 2),
  status public.expense_status not null default 'due',
  payment_method public.payment_method,
  recurring boolean not null default false,
  recurrence public.expense_recurrence,
  file_path text,
  proof_file_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amounts_nonnegative check (
    amount_excl_vat >= 0
    and vat_amount >= 0
    and total >= 0
    and (amount_paid is null or amount_paid >= 0)
  ),
  constraint expenses_total_is_sum check (total = amount_excl_vat + vat_amount),
  constraint expenses_paid_fields check (
    (
      status = 'paid'
      and paid_date is not null
      and amount_paid is not null
    )
    or (
      status != 'paid'
      and paid_date is null
      and amount_paid is null
      and payment_method is null
      and proof_file_path is null
    )
  ),
  constraint expenses_recurrence_matches_flag check (
    (recurring and recurrence is not null)
    or ((not recurring) and recurrence is null)
  ),
  constraint expenses_supplier_length check (
    supplier is null or char_length(supplier) between 1 and 200
  ),
  constraint expenses_description_length check (
    description is null or char_length(description) between 1 and 2000
  ),
  constraint expenses_invoice_number_length check (
    invoice_number is null or char_length(invoice_number) between 1 and 100
  ),
  constraint expenses_files_distinct check (
    file_path is null
    or proof_file_path is null
    or file_path != proof_file_path
  ),
  constraint expenses_file_path_shape check (
    file_path is null
    or (
      file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
      and lower(split_part(file_path, '/', 1)) = property_id::text
    )
  ),
  constraint expenses_proof_file_path_shape check (
    proof_file_path is null
    or (
      proof_file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
      and lower(split_part(proof_file_path, '/', 1)) = property_id::text
    )
  )
);

create unique index expenses_file_path_key
  on public.expenses (file_path)
  where file_path is not null;

create unique index expenses_proof_file_path_key
  on public.expenses (proof_file_path)
  where proof_file_path is not null;

create index expenses_property_due_idx
  on public.expenses (property_id, due_date);

create index expenses_category_id_idx
  on public.expenses (category_id);

create index expenses_created_by_idx
  on public.expenses (created_by);

create index expenses_recurring_due_idx
  on public.expenses (property_id, due_date)
  where recurring;

comment on table public.expenses is
  'Property expenses. Total is always the excl. amount plus VAT. Invoice and proof files are stored in the bills bucket. Recurring rows are the source for the next generated due entry.';

update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
where id = 'bills';

-- ---------------------------------------------------------------------------
-- Row guards
-- ---------------------------------------------------------------------------

create or replace function private.expenses_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := (select auth.uid());
    end if;
  elsif new.id is distinct from old.id
    or new.property_id is distinct from old.property_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'This expense cannot be moved'
      using errcode = '42501';
  end if;

  if new.supplier is not null then
    new.supplier := nullif(btrim(new.supplier), '');
  end if;

  if new.description is not null then
    new.description := nullif(btrim(new.description), '');
  end if;

  if new.invoice_number is not null then
    new.invoice_number := nullif(btrim(new.invoice_number), '');
  end if;

  if not new.recurring then
    new.recurrence := null;
  end if;

  if new.paid_date is not null then
    if new.amount_paid is null then
      raise exception 'Enter the amount paid'
        using errcode = '23514';
    end if;

    new.status := 'paid';
  else
    new.amount_paid := null;
    new.payment_method := null;
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
    raise exception 'Invoice file does not belong to this property'
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
    from public.expenses as expense
    where expense.id is distinct from new.id
      and (
        expense.file_path = new.file_path
        or expense.proof_file_path = new.file_path
      )
  ) then
    raise exception 'That invoice file is already saved'
      using errcode = '23505';
  end if;

  if new.proof_file_path is not null and exists (
    select 1
    from public.expenses as expense
    where expense.id is distinct from new.id
      and (
        expense.file_path = new.proof_file_path
        or expense.proof_file_path = new.proof_file_path
      )
  ) then
    raise exception 'That proof of payment is already saved'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function private.expense_file_linked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses as expense
    where expense.file_path = object_name
      or expense.proof_file_path = object_name
  );
$$;

create or replace function private.expense_storage_file(object_path text)
returns table (file_size bigint, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when obj.metadata ->> 'size' ~ '^[0-9]+$'
        then (obj.metadata ->> 'size')::bigint
      else null
    end as file_size,
    case
      when mime.stored_mime = 'image/jpg' then 'image/jpeg'
      else mime.stored_mime
    end as mime_type
  from storage.objects as obj
  cross join lateral (
    select lower(split_part(coalesce(obj.metadata ->> 'mimetype', ''), ';', 1)) as stored_mime
  ) as mime
  where (select auth.uid()) is not null
    and obj.bucket_id = 'bills'
    and obj.name = object_path
    and obj.owner = (select auth.uid())
    and private.can_access_object('bills', object_path);
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

create or replace function public.expense_storage_file(object_path text)
returns table (file_size bigint, mime_type text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select result.file_size, result.mime_type
  from private.expense_storage_file(object_path) as result;
end;
$$;

create or replace function public.remove_unlinked_expense_file(object_path text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.remove_unlinked_expense_file(object_path);
end;
$$;

-- Copies last period's recurring expenses into due rows for the current
-- Johannesburg month. Monthly uses last month, quarterly uses three months
-- ago, and annually uses the same month last year. Amounts are copied.
-- Invoice files, payment, and invoice numbers are not. A series is one
-- property, category, supplier, description, and recurrence. Existing rows
-- already due this month are left as they are.
create or replace function public.generate_recurring_expenses(p_property_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (timezone('Africa/Johannesburg', now()))::date;
  v_month_start date := date_trunc('month', v_today::timestamp)::date;
  v_created integer := 0;
  v_source record;
  v_target date;
  v_invoice date;
begin
  perform pg_advisory_xact_lock(hashtext('ellis_pms_recurring_expenses'));

  for v_source in
    select expense.*
    from public.expenses as expense
    where expense.recurring
      and expense.recurrence is not null
      and (p_property_id is null or expense.property_id = p_property_id)
    order by expense.due_date desc, expense.updated_at desc
  loop
    v_target := case v_source.recurrence
      when 'monthly' then (v_source.due_date + interval '1 month')::date
      when 'quarterly' then (v_source.due_date + interval '3 months')::date
      when 'annually' then (v_source.due_date + interval '1 year')::date
    end;

    if date_trunc('month', v_target::timestamp)::date != v_month_start then
      continue;
    end if;

    if exists (
      select 1
      from public.expenses as existing
      where existing.property_id = v_source.property_id
        and existing.category_id = v_source.category_id
        and existing.recurrence is not distinct from v_source.recurrence
        and lower(coalesce(existing.supplier, '')) = lower(coalesce(v_source.supplier, ''))
        and lower(coalesce(existing.description, '')) = lower(coalesce(v_source.description, ''))
        and existing.due_date >= v_month_start
        and not (existing.due_date > ((v_month_start + interval '1 month')::date - 1))
    ) then
      continue;
    end if;

    v_invoice := case
      when v_source.invoice_date is null then null
      when v_source.recurrence = 'monthly' then (v_source.invoice_date + interval '1 month')::date
      when v_source.recurrence = 'quarterly' then (v_source.invoice_date + interval '3 months')::date
      else (v_source.invoice_date + interval '1 year')::date
    end;

    insert into public.expenses (
      property_id,
      category_id,
      supplier,
      description,
      invoice_date,
      amount_excl_vat,
      vat_amount,
      total,
      due_date,
      status,
      recurring,
      recurrence
    )
    values (
      v_source.property_id,
      v_source.category_id,
      v_source.supplier,
      v_source.description,
      v_invoice,
      v_source.amount_excl_vat,
      v_source.vat_amount,
      v_source.total,
      v_target,
      'due',
      true,
      v_source.recurrence
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity log knows which property an expense belongs to
-- ---------------------------------------------------------------------------

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
    'expenses'
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

create trigger expenses_prepare
  before insert or update on public.expenses
  for each row execute function private.expenses_prepare();

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function private.set_updated_at();

create trigger expenses_log_activity
  after insert or update or delete on public.expenses
  for each row execute function private.log_activity();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.expenses_prepare() from public, anon;
revoke all on function private.expense_file_linked(text) from public, anon;
revoke all on function private.expense_storage_file(text) from public, anon;
revoke all on function private.remove_unlinked_expense_file(text) from public, anon;
revoke all on function public.expense_storage_file(text) from public, anon;
revoke all on function public.remove_unlinked_expense_file(text) from public, anon;
revoke all on function public.generate_recurring_expenses(uuid) from public, anon;

grant execute on function private.expenses_prepare() to authenticated, service_role;
grant execute on function private.expense_file_linked(text) to authenticated, service_role;
grant execute on function private.expense_storage_file(text) to authenticated, service_role;
grant execute on function private.remove_unlinked_expense_file(text) to authenticated, service_role;
grant execute on function public.expense_storage_file(text) to authenticated, service_role;
grant execute on function public.remove_unlinked_expense_file(text) to authenticated, service_role;
grant execute on function public.generate_recurring_expenses(uuid) to authenticated, service_role;

revoke all on table public.expense_categories from public, anon;
grant select on table public.expense_categories to authenticated;
grant select, insert, update, delete on table public.expense_categories to service_role;

revoke all on table public.expenses from public, anon;
grant select, insert, delete on table public.expenses to authenticated, service_role;
grant update (
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
  payment_method,
  recurring,
  recurrence,
  file_path,
  proof_file_path,
  updated_at
) on table public.expenses to authenticated;
grant update on table public.expenses to service_role;

comment on function public.remove_unlinked_expense_file(text) is
  'Deletes a bills object owned by the current user when no expense row points at it.';

comment on function public.generate_recurring_expenses(uuid) is
  'Creates this month''s due expenses from the previous recurring period. Pass a property id to limit the run. Row level security still applies.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy expense_categories_select
  on public.expense_categories
  for select
  to authenticated
  using (true);

create policy expenses_select
  on public.expenses
  for select
  to authenticated
  using ((select private.can_access_property(property_id)));

create policy expenses_insert
  on public.expenses
  for insert
  to authenticated
  with check ((select private.can_access_property(property_id)));

create policy expenses_update
  on public.expenses
  for update
  to authenticated
  using ((select private.can_access_property(property_id)))
  with check ((select private.can_access_property(property_id)));

create policy expenses_delete
  on public.expenses
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
        'expenses'
      )
      and (select private.can_access_property(property_id))
    )
  );

-- Linked bill files stay put. An unlinked upload can still be removed by
-- someone who can access the property. Property documents stay admin-only.
drop policy property_files_update on storage.objects;
drop policy property_files_delete on storage.objects;

create policy property_files_update
  on storage.objects
  for update
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
    )
  )
  with check (
    (select private.can_access_object(bucket_id, name))
    and (
      (
        bucket_id != 'property-documents'
        and bucket_id != 'statements'
        and bucket_id != 'bills'
      )
      or (select private.is_admin())
    )
  );

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
      )
    )
  );
