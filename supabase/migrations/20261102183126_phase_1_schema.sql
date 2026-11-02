-- Phase 1: roles, properties, documents, activity log, and private storage.
--
-- Authorization data lives in public.profiles. Helper lookups run as
-- security definer functions in the unexposed private schema so policies
-- can read profiles and property_access without recursive RLS.
-- Public wrappers are security invoker and only delegate to those functions.
--
-- Property managers have no select policy on public.properties, so a direct
-- read returns no rows and cannot reveal purchase price, costs, bond fields,
-- or current_value. They read public.properties_basic instead. That view is
-- security_invoker and selects only the non-financial columns from
-- private.properties_basic_rows(), which applies can_access_property().

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum (
  'owner',
  'partner',
  'property_manager'
);

create type public.rental_type as enum (
  'long_term',
  'short_term'
);

create type public.property_type as enum (
  'freehold',
  'sectional_title'
);

create type public.property_status as enum (
  'active',
  'sold'
);

create type public.sa_province as enum (
  'eastern_cape',
  'free_state',
  'gauteng',
  'kwazulu_natal',
  'limpopo',
  'mpumalanga',
  'northern_cape',
  'north_west',
  'western_cape'
);

create type public.document_category as enum (
  'title_deed',
  'lease',
  'insurance',
  'compliance_certificate',
  'municipal',
  'body_corporate',
  'statement',
  'invoice',
  'photo',
  'other'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role public.user_role not null default 'property_manager',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_key unique (email)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rental_type public.rental_type not null,
  property_type public.property_type not null,
  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  province public.sa_province,
  postal_code text,
  erf_number text,
  unit_number text,
  scheme_number text,
  purchase_price numeric(14, 2),
  purchase_date date,
  transfer_costs numeric(14, 2),
  improvement_costs numeric(14, 2),
  current_value numeric(14, 2),
  bond_bank text,
  bond_amount numeric(14, 2),
  bond_monthly_payment numeric(14, 2),
  bond_interest_rate numeric(6, 3),
  body_corporate_name text,
  municipal_account_number text,
  notes text,
  status public.property_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint properties_purchase_price_nonnegative
    check (purchase_price is null or purchase_price >= 0),
  constraint properties_transfer_costs_nonnegative
    check (transfer_costs is null or transfer_costs >= 0),
  constraint properties_improvement_costs_nonnegative
    check (improvement_costs is null or improvement_costs >= 0),
  constraint properties_current_value_nonnegative
    check (current_value is null or current_value >= 0),
  constraint properties_bond_amount_nonnegative
    check (bond_amount is null or bond_amount >= 0),
  constraint properties_bond_monthly_payment_nonnegative
    check (bond_monthly_payment is null or bond_monthly_payment >= 0),
  constraint properties_bond_interest_rate_range
    check (
      bond_interest_rate is null
      or (bond_interest_rate >= 0 and bond_interest_rate <= 100)
    )
);

create table public.property_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  category public.document_category not null,
  name text not null,
  file_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint documents_file_size_nonnegative
    check (file_size is null or file_size >= 0)
);

-- property_id is denormalized so property managers can be limited to activity
-- for properties assigned to them. Profile events leave it null.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  property_id uuid references public.properties (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_log_action_check
    check (action in ('insert', 'update', 'delete'))
);

create index property_access_property_id_idx
  on public.property_access (property_id);

create index properties_created_by_idx
  on public.properties (created_by);

create index documents_property_id_idx
  on public.documents (property_id);

create index documents_uploaded_by_idx
  on public.documents (uploaded_by);

create index activity_log_property_entity_idx
  on public.activity_log (property_id, entity_type);

create index activity_log_user_id_idx
  on public.activity_log (user_id);

create index activity_log_created_at_idx
  on public.activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role, supabase_auth_admin;

alter default privileges in schema private
  revoke execute on functions from public;

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid());
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_user_role() in ('owner', 'partner'),
    false
  );
$$;

create or replace function private.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_property_id is not null
    and (
      private.is_admin()
      or exists (
        select 1
        from public.property_access as pa
        where pa.property_id = target_property_id
          and pa.user_id = (select auth.uid())
      )
    );
$$;

create or replace function private.property_id_from_path(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  segment text;
begin
  segment := (storage.foldername(object_name))[1];

  if segment is null
    or segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return null;
  end if;

  return segment::uuid;
end;
$$;

-- First path segment is the property id. The second segment is the year.
-- Object key shape: {property_id}/{yyyy}/{filename}.
create or replace function private.can_access_object(bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    bucket in (
      'property-documents',
      'statements',
      'bills',
      'invoices'
    )
    and coalesce(array_length(storage.foldername(object_name), 1) = 2, false)
    and (storage.foldername(object_name))[2] ~ '^[0-9]{4}$'
    and private.can_access_property(private.property_id_from_path(object_name));
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.protect_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and (
      tg_op = 'DELETE'
      or new.role is distinct from 'owner'
    )
    and not exists (
      select 1
      from public.profiles as p
      where p.role = 'owner'
        and p.id <> old.id
    )
  then
    raise exception 'The owner cannot be removed'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
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
  elsif tg_table_name = 'documents' then
    v_entity_id := (v_row ->> 'id')::uuid;
    v_property_id := (v_row ->> 'property_id')::uuid;
  elsif tg_table_name = 'property_access' then
    v_entity_id := (v_row ->> 'property_id')::uuid;
    v_property_id := v_entity_id;
  elsif tg_table_name = 'profiles' then
    v_entity_id := (v_row ->> 'id')::uuid;
    v_property_id := null;
  else
    v_entity_id := null;
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

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role public.user_role;
begin
  -- Serialize signups so two concurrent first users cannot both become owner.
  perform pg_advisory_xact_lock(hashtext('ellis_pms_first_owner'));

  if not exists (select 1 from public.profiles) then
    assigned_role := 'owner';
  else
    assigned_role := 'property_manager';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(new.email, ''),
    assigned_role
  );

  return new;
end;
$$;

create or replace function private.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = nullif(new.email, '')
  where id = new.id
    and email is distinct from nullif(new.email, '');

  return new;
end;
$$;

create or replace function private.properties_basic_rows()
returns table (
  id uuid,
  name text,
  rental_type public.rental_type,
  property_type public.property_type,
  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  province public.sa_province,
  postal_code text,
  erf_number text,
  unit_number text,
  scheme_number text,
  purchase_date date,
  body_corporate_name text,
  municipal_account_number text,
  notes text,
  status public.property_status,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.rental_type,
    p.property_type,
    p.address_line1,
    p.address_line2,
    p.suburb,
    p.city,
    p.province,
    p.postal_code,
    p.erf_number,
    p.unit_number,
    p.scheme_number,
    p.purchase_date,
    p.body_corporate_name,
    p.municipal_account_number,
    p.notes,
    p.status,
    p.created_at,
    p.updated_at,
    p.created_by
  from public.properties as p
  where auth.role() = 'service_role'
    or private.can_access_property(p.id);
$$;

revoke all on function private.current_user_role() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.can_access_property(uuid) from public, anon;
revoke all on function private.property_id_from_path(text) from public, anon;
revoke all on function private.can_access_object(text, text) from public, anon;
revoke all on function private.set_updated_at() from public, anon;
revoke all on function private.protect_owner() from public, anon;
revoke all on function private.log_activity() from public, anon;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.sync_user_email() from public, anon, authenticated;
revoke all on function private.properties_basic_rows() from public, anon;

grant execute on function private.current_user_role() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.can_access_property(uuid) to authenticated, service_role;
grant execute on function private.property_id_from_path(text) to authenticated, service_role;
grant execute on function private.can_access_object(text, text) to authenticated, service_role;
grant execute on function private.set_updated_at() to authenticated, service_role;
grant execute on function private.protect_owner() to authenticated, service_role;
grant execute on function private.log_activity() to authenticated, service_role;
grant execute on function private.properties_basic_rows() to authenticated, service_role;
grant execute on function private.handle_new_user() to supabase_auth_admin;
grant execute on function private.sync_user_email() to supabase_auth_admin;

-- Callable from the app. These do not bypass RLS themselves.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_user_role();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

create or replace function public.can_access_property(property_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_access_property(property_id);
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.can_access_property(uuid) from public, anon;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_access_property(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profiles_protect_owner
  before update or delete on public.profiles
  for each row execute function private.protect_owner();

create trigger profiles_log_activity
  after insert or update or delete on public.profiles
  for each row execute function private.log_activity();

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function private.set_updated_at();

create trigger properties_log_activity
  after insert or update or delete on public.properties
  for each row execute function private.log_activity();

create trigger property_access_log_activity
  after insert or update or delete on public.property_access
  for each row execute function private.log_activity();

create trigger documents_log_activity
  after insert or update or delete on public.documents
  for each row execute function private.log_activity();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function private.sync_user_email();

-- Existing auth users (if this migration is applied to a project that already
-- has signups) get a profile. The earliest account becomes the owner.
alter table public.profiles disable trigger profiles_log_activity;

insert into public.profiles (id, full_name, email, role)
select
  users.id,
  nullif(trim(coalesce(users.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(users.email, ''),
  case
    when users.id = (
      select earliest.id
      from auth.users as earliest
      order by earliest.created_at asc, earliest.id asc
      limit 1
    ) then 'owner'::public.user_role
    else 'property_manager'::public.user_role
  end
from auth.users as users
where not exists (
  select 1
  from public.profiles as existing
  where existing.id = users.id
);

alter table public.profiles enable trigger profiles_log_activity;

-- ---------------------------------------------------------------------------
-- properties_basic
-- ---------------------------------------------------------------------------

create view public.properties_basic
with (security_invoker = true) as
select
  id,
  name,
  rental_type,
  property_type,
  address_line1,
  address_line2,
  suburb,
  city,
  province,
  postal_code,
  erf_number,
  unit_number,
  scheme_number,
  purchase_date,
  body_corporate_name,
  municipal_account_number,
  notes,
  status,
  created_at,
  updated_at,
  created_by
from private.properties_basic_rows();

comment on view public.properties_basic is
  'Property columns safe for property managers. Omits purchase_price, transfer_costs, improvement_costs, current_value, and bond fields. security_invoker: callers need execute on private.properties_basic_rows(). Owners and partners read public.properties for the full row.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from public, anon;
revoke all on table public.properties from public, anon;
revoke all on table public.property_access from public, anon;
revoke all on table public.documents from public, anon;
revoke all on table public.activity_log from public, anon;
revoke all on table public.properties_basic from public, anon;

grant select, insert, update, delete on table public.profiles to authenticated, service_role;
grant select, insert, update, delete on table public.properties to authenticated, service_role;
grant select, insert, update, delete on table public.property_access to authenticated, service_role;
grant select, insert, update, delete on table public.documents to authenticated, service_role;
grant select, insert, update, delete on table public.activity_log to authenticated, service_role;
grant select on table public.properties_basic to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_access enable row level security;
alter table public.documents enable row level security;
alter table public.activity_log enable row level security;

create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    (select private.is_admin())
    or id = (select auth.uid())
  );

create policy profiles_update
  on public.profiles
  for update
  to authenticated
  using (
    (select private.is_admin())
    and (
      (select private.current_user_role()) = 'owner'
      or role <> 'owner'
    )
  )
  with check (
    (select private.current_user_role()) = 'owner'
    or role <> 'owner'
  );

create policy profiles_delete
  on public.profiles
  for delete
  to authenticated
  using (
    (
      (select private.current_user_role()) = 'owner'
      and id <> (select auth.uid())
    )
    or (
      (select private.current_user_role()) = 'partner'
      and role <> 'owner'
    )
  );

-- Admins read and write the full table, including financial columns.
-- Property managers intentionally have no select policy here.
create policy properties_select_admin
  on public.properties
  for select
  to authenticated
  using ((select private.is_admin()));

create policy properties_insert_admin
  on public.properties
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy properties_update_admin
  on public.properties
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy properties_delete_admin
  on public.properties
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy property_access_select
  on public.property_access
  for select
  to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())
  );

create policy property_access_insert_admin
  on public.property_access
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    and exists (
      select 1
      from public.profiles as p
      where p.id = user_id
        and p.role = 'property_manager'
    )
  );

create policy property_access_update_admin
  on public.property_access
  for update
  to authenticated
  using ((select private.is_admin()))
  with check (
    (select private.is_admin())
    and exists (
      select 1
      from public.profiles as p
      where p.id = user_id
        and p.role = 'property_manager'
    )
  );

create policy property_access_delete_admin
  on public.property_access
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy documents_select
  on public.documents
  for select
  to authenticated
  using ((select private.can_access_property(property_id)));

create policy documents_insert
  on public.documents
  for insert
  to authenticated
  with check (
    (select private.can_access_property(property_id))
    and uploaded_by = (select auth.uid())
  );

create policy documents_update
  on public.documents
  for update
  to authenticated
  using ((select private.can_access_property(property_id)))
  with check ((select private.can_access_property(property_id)));

create policy documents_delete
  on public.documents
  for delete
  to authenticated
  using ((select private.can_access_property(property_id)));

-- Property snapshots include financial columns, so managers only see document
-- and assignment events (entity_type is the source table name) for properties
-- they can access.
create policy activity_log_select
  on public.activity_log
  for select
  to authenticated
  using (
    (select private.is_admin())
    or (
      property_id is not null
      and entity_type in ('documents', 'property_access')
      and (select private.can_access_property(property_id))
    )
  );

create policy activity_log_insert_admin
  on public.activity_log
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy activity_log_update_admin
  on public.activity_log
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy activity_log_delete_admin
  on public.activity_log
  for delete
  to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Private storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('property-documents', 'property-documents', false),
  ('statements', 'statements', false),
  ('bills', 'bills', false),
  ('invoices', 'invoices', false)
on conflict (id) do update
set public = excluded.public;

create policy property_files_select
  on storage.objects
  for select
  to authenticated
  using ((select private.can_access_object(bucket_id, name)));

create policy property_files_insert
  on storage.objects
  for insert
  to authenticated
  with check ((select private.can_access_object(bucket_id, name)));

create policy property_files_update
  on storage.objects
  for update
  to authenticated
  using ((select private.can_access_object(bucket_id, name)))
  with check ((select private.can_access_object(bucket_id, name)));

create policy property_files_delete
  on storage.objects
  for delete
  to authenticated
  using ((select private.can_access_object(bucket_id, name)));
