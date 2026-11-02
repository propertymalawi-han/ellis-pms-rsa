-- Short-term owner's statements. Amounts are entered by hand; the file is
-- only a reference. One statement per property per month. Property managers
-- can read and write statements for properties assigned to them. Deletes are
-- limited to owners and partners. Changes are written to activity_log.

create type public.owner_statement_status as enum ('expected', 'received');

create table public.owner_statements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  period_month date not null,
  statement_date date,
  manager_name text,
  nights_booked integer not null,
  bookings_count integer not null,
  gross_income numeric(14, 2) not null,
  platform_fees numeric(14, 2) not null,
  management_fee numeric(14, 2) not null,
  cleaning_fees numeric(14, 2) not null,
  other_deductions numeric(14, 2) not null,
  vat_on_fees numeric(14, 2) not null,
  net_payout numeric(14, 2) not null,
  payout_date date,
  status public.owner_statement_status not null default 'expected',
  file_path text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_statements_property_period_key unique (property_id, period_month),
  constraint owner_statements_file_path_key unique (file_path),
  constraint owner_statements_period_first_of_month
    check (extract(day from period_month) = 1),
  constraint owner_statements_nights_range
    check (nights_booked >= 0 and nights_booked <= 31),
  constraint owner_statements_bookings_range
    check (bookings_count >= 0 and bookings_count <= 9999),
  constraint owner_statements_amounts_nonnegative
    check (
      gross_income >= 0
      and platform_fees >= 0
      and management_fee >= 0
      and cleaning_fees >= 0
      and other_deductions >= 0
      and vat_on_fees >= 0
    ),
  constraint owner_statements_manager_name_length
    check (manager_name is null or char_length(manager_name) between 1 and 200),
  constraint owner_statements_file_path_shape
    check (
      file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
      and lower(split_part(file_path, '/', 1)) = property_id::text
    )
);

create index owner_statements_uploaded_by_idx
  on public.owner_statements (uploaded_by);

comment on table public.owner_statements is
  'Monthly short-term income from an owner''s statement. Net payout may differ from gross minus deductions when the user overrides it. The file is stored in the statements bucket.';

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
where id = 'statements';

-- ---------------------------------------------------------------------------
-- Row guards
-- ---------------------------------------------------------------------------

create or replace function private.owner_statements_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.uploaded_by := (select auth.uid());
    end if;

    if not exists (
      select 1
      from public.properties as property
      where property.id = new.property_id
        and property.rental_type = 'short_term'
    ) then
      raise exception 'Owner statements are only for short-term properties'
        using errcode = '23514';
    end if;
  elsif new.id is distinct from old.id
    or new.property_id is distinct from old.property_id
    or new.uploaded_by is distinct from old.uploaded_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'This statement cannot be moved'
      using errcode = '42501';
  end if;

  if new.manager_name is not null then
    new.manager_name := nullif(btrim(new.manager_name), '');
  end if;

  if extract(day from new.period_month) <> 1 then
    raise exception 'Period month must be the first day of the month'
      using errcode = '23514';
  end if;

  v_days := extract(
    day from (new.period_month + interval '1 month' - interval '1 day')
  )::integer;

  if new.nights_booked < 0 or new.nights_booked > v_days then
    raise exception 'Nights booked cannot be more than the days in that month'
      using errcode = '23514';
  end if;

  if new.bookings_count < 0 or new.bookings_count > 9999 then
    raise exception 'Bookings must be between 0 and 9999'
      using errcode = '23514';
  end if;

  if lower(split_part(new.file_path, '/', 1)) is distinct from new.property_id::text then
    raise exception 'Statement file does not belong to this property'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.statement_file_linked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.owner_statements as statement
    where statement.file_path = object_name
  );
$$;

create or replace function private.statement_storage_file(object_path text)
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
    and obj.bucket_id = 'statements'
    and obj.name = object_path
    and obj.owner = (select auth.uid())
    and private.can_access_object('statements', object_path);
$$;

create or replace function private.remove_unlinked_statement(object_path text)
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

  if not private.can_access_object('statements', object_path) then
    raise exception 'Statement not found'
      using errcode = '42501';
  end if;

  if private.statement_file_linked(object_path) then
    raise exception 'Statement is already saved'
      using errcode = '42501';
  end if;

  delete from storage.objects as obj
  where obj.bucket_id = 'statements'
    and obj.name = object_path
    and obj.owner = (select auth.uid());

  if not found then
    raise exception 'Statement not found'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.statement_storage_file(object_path text)
returns table (file_size bigint, mime_type text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select result.file_size, result.mime_type
  from private.statement_storage_file(object_path) as result;
end;
$$;

create or replace function public.remove_unlinked_statement(object_path text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.remove_unlinked_statement(object_path);
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity log knows which property a statement belongs to
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
    'owner_statements'
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

create trigger owner_statements_prepare
  before insert or update on public.owner_statements
  for each row execute function private.owner_statements_prepare();

create trigger owner_statements_set_updated_at
  before update on public.owner_statements
  for each row execute function private.set_updated_at();

create trigger owner_statements_log_activity
  after insert or update or delete on public.owner_statements
  for each row execute function private.log_activity();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.owner_statements_prepare() from public, anon;
revoke all on function private.statement_file_linked(text) from public, anon;
revoke all on function private.statement_storage_file(text) from public, anon;
revoke all on function private.remove_unlinked_statement(text) from public, anon;
revoke all on function public.statement_storage_file(text) from public, anon;
revoke all on function public.remove_unlinked_statement(text) from public, anon;

grant execute on function private.owner_statements_prepare() to authenticated, service_role;
grant execute on function private.statement_file_linked(text) to authenticated, service_role;
grant execute on function private.statement_storage_file(text) to authenticated, service_role;
grant execute on function private.remove_unlinked_statement(text) to authenticated, service_role;
grant execute on function public.statement_storage_file(text) to authenticated, service_role;
grant execute on function public.remove_unlinked_statement(text) to authenticated, service_role;

revoke all on table public.owner_statements from public, anon;
grant select, insert, delete on table public.owner_statements to authenticated, service_role;
grant update (
  period_month,
  statement_date,
  manager_name,
  nights_booked,
  bookings_count,
  gross_income,
  platform_fees,
  management_fee,
  cleaning_fees,
  other_deductions,
  vat_on_fees,
  net_payout,
  payout_date,
  status,
  file_path,
  updated_at
) on table public.owner_statements to authenticated;
grant update on table public.owner_statements to service_role;

comment on function public.remove_unlinked_statement(text) is
  'Deletes a statements object owned by the current user when no owner_statements row points at it.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.owner_statements enable row level security;

create policy owner_statements_select
  on public.owner_statements
  for select
  to authenticated
  using ((select private.can_access_property(property_id)));

create policy owner_statements_insert
  on public.owner_statements
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (select private.can_access_property(property_id))
  );

create policy owner_statements_update
  on public.owner_statements
  for update
  to authenticated
  using ((select private.can_access_property(property_id)))
  with check ((select private.can_access_property(property_id)));

create policy owner_statements_delete
  on public.owner_statements
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
        'owner_statements'
      )
      and (select private.can_access_property(property_id))
    )
  );

-- Linked statement files stay put. An unlinked upload can still be removed
-- by someone who can access the property. Property documents stay admin-only.
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
        bucket_id <> 'property-documents'
        and bucket_id <> 'statements'
      )
      or (select private.is_admin())
    )
  )
  with check (
    (select private.can_access_object(bucket_id, name))
    and (
      (
        bucket_id <> 'property-documents'
        and bucket_id <> 'statements'
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
        bucket_id <> 'property-documents'
        and bucket_id <> 'statements'
      )
      or (select private.is_admin())
      or (
        bucket_id = 'statements'
        and not (select private.statement_file_linked(name))
      )
    )
  );
