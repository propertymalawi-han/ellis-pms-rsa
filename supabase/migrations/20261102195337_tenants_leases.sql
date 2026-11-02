-- Tenants and leases for long-term properties.
--
-- Owners and partners (private.is_admin) have full access. Property managers
-- can read and write leases on properties assigned to them, and tenants they
-- created or who have a lease on one of those properties.
-- Inserts, updates and deletes are written to activity_log by private.log_activity.
-- Lease rows are visible to property managers in that log. Tenant rows are not
-- tied to one property, so those log rows stay admin-only.

create type public.lease_status as enum (
  'active',
  'ended'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  id_number text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint tenants_full_name_length
    check (char_length(full_name) between 1 and 200),
  constraint tenants_id_number_length
    check (id_number is null or char_length(id_number) between 1 and 20),
  constraint tenants_email_format
    check (
      email is null
      or (
        char_length(email) <= 200
        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  constraint tenants_phone_length
    check (phone is null or char_length(phone) between 1 and 40),
  constraint tenants_notes_length
    check (notes is null or char_length(notes) <= 5000)
);

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  monthly_rent numeric(14, 2) not null,
  deposit_amount numeric(14, 2) not null,
  deposit_held_by text not null,
  escalation_percent numeric(5, 2),
  escalation_date date,
  rent_due_day smallint not null default 1,
  status public.lease_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint leases_end_after_start
    check (end_date >= start_date),
  constraint leases_monthly_rent_nonnegative
    check (monthly_rent >= 0),
  constraint leases_deposit_amount_nonnegative
    check (deposit_amount >= 0),
  constraint leases_deposit_held_by_length
    check (char_length(deposit_held_by) between 1 and 120),
  constraint leases_escalation_percent_range
    check (
      escalation_percent is null
      or (escalation_percent >= 0 and escalation_percent <= 100)
    ),
  constraint leases_escalation_date_after_start
    check (escalation_date is null or escalation_date >= start_date),
  constraint leases_rent_due_day_range
    check (rent_due_day between 1 and 31)
);

create index tenants_created_by_idx
  on public.tenants (created_by);

create unique index tenants_id_number_key
  on public.tenants (id_number)
  where id_number is not null;

create index leases_property_id_idx
  on public.leases (property_id);

create index leases_tenant_id_idx
  on public.leases (tenant_id);

create index leases_created_by_idx
  on public.leases (created_by);

create unique index leases_one_active_per_property_idx
  on public.leases (property_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.can_create_tenant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.property_access as pa
      where pa.user_id = (select auth.uid())
    );
$$;

create or replace function private.can_access_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and (
      private.is_admin()
      or exists (
        select 1
        from public.tenants as t
        where t.id = target_tenant_id
          and t.created_by = (select auth.uid())
      )
      or exists (
        select 1
        from public.leases as l
        where l.tenant_id = target_tenant_id
          and private.can_access_property(l.property_id)
      )
    );
$$;

create or replace function private.can_delete_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      exists (
        select 1
        from public.tenants as t
        where t.id = target_tenant_id
          and t.created_by = (select auth.uid())
      )
      and not exists (
        select 1
        from public.leases as l
        where l.tenant_id = target_tenant_id
      )
    );
$$;

create or replace function private.tenants_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Tenant identity fields cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.leases_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.property_id is distinct from old.property_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Lease identity fields cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.leases_require_long_term()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.properties as p
    where p.id = new.property_id
      and p.rental_type = 'long_term'
  ) then
    raise exception 'Leases can only be added to long-term properties'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.leases_require_visible_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.tenant_id is not distinct from old.tenant_id then
    return new;
  end if;

  if not private.can_access_tenant(new.tenant_id) then
    raise exception 'Tenant not found'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.properties_keep_long_term_leases()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rental_type is distinct from old.rental_type
    and new.rental_type <> 'long_term'
    and exists (
      select 1
      from public.leases as l
      where l.property_id = new.id
    )
  then
    raise exception 'This property has leases, so it must stay a long-term rental'
      using errcode = '23514';
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
  elsif tg_table_name = 'leases' then
    v_entity_id := (v_row ->> 'id')::uuid;
    v_property_id := (v_row ->> 'property_id')::uuid;
  elsif tg_table_name = 'tenants' then
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

revoke all on function private.can_create_tenant() from public, anon;
revoke all on function private.can_access_tenant(uuid) from public, anon;
revoke all on function private.can_delete_tenant(uuid) from public, anon;
revoke all on function private.tenants_guard_update() from public, anon;
revoke all on function private.leases_guard_update() from public, anon;
revoke all on function private.leases_require_long_term() from public, anon;
revoke all on function private.leases_require_visible_tenant() from public, anon;
revoke all on function private.properties_keep_long_term_leases() from public, anon;

grant execute on function private.can_create_tenant() to authenticated, service_role;
grant execute on function private.can_access_tenant(uuid) to authenticated, service_role;
grant execute on function private.can_delete_tenant(uuid) to authenticated, service_role;
grant execute on function private.tenants_guard_update() to authenticated, service_role;
grant execute on function private.leases_guard_update() to authenticated, service_role;
grant execute on function private.leases_require_long_term() to authenticated, service_role;
grant execute on function private.leases_require_visible_tenant() to authenticated, service_role;
grant execute on function private.properties_keep_long_term_leases() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();

create trigger tenants_guard_update
  before update on public.tenants
  for each row execute function private.tenants_guard_update();

create trigger tenants_log_activity
  after insert or update or delete on public.tenants
  for each row execute function private.log_activity();

create trigger leases_set_updated_at
  before update on public.leases
  for each row execute function private.set_updated_at();

create trigger leases_guard_update
  before update on public.leases
  for each row execute function private.leases_guard_update();

create trigger leases_require_long_term
  before insert or update on public.leases
  for each row execute function private.leases_require_long_term();

create trigger leases_require_visible_tenant
  before insert or update of tenant_id on public.leases
  for each row execute function private.leases_require_visible_tenant();

create trigger leases_log_activity
  after insert or update or delete on public.leases
  for each row execute function private.log_activity();

create trigger properties_keep_long_term_leases
  before update of rental_type on public.properties
  for each row execute function private.properties_keep_long_term_leases();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.tenants from public, anon;
revoke all on table public.leases from public, anon;

grant select, insert, update, delete on table public.tenants to authenticated, service_role;
grant select, insert, update, delete on table public.leases to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.leases enable row level security;

create policy tenants_select
  on public.tenants
  for select
  to authenticated
  using ((select private.can_access_tenant(id)));

create policy tenants_insert
  on public.tenants
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_create_tenant())
  );

create policy tenants_update
  on public.tenants
  for update
  to authenticated
  using ((select private.can_access_tenant(id)))
  with check ((select private.can_access_tenant(id)));

create policy tenants_delete
  on public.tenants
  for delete
  to authenticated
  using ((select private.can_delete_tenant(id)));

create policy leases_select
  on public.leases
  for select
  to authenticated
  using ((select private.can_access_property(property_id)));

create policy leases_insert
  on public.leases
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_access_property(property_id))
  );

create policy leases_update
  on public.leases
  for update
  to authenticated
  using ((select private.can_access_property(property_id)))
  with check ((select private.can_access_property(property_id)));

create policy leases_delete
  on public.leases
  for delete
  to authenticated
  using ((select private.can_access_property(property_id)));

-- Lease snapshots include rent and deposit, which property managers may see.
-- Tenant snapshots are not tied to a property, so they stay admin-only.
drop policy activity_log_select on public.activity_log;

create policy activity_log_select
  on public.activity_log
  for select
  to authenticated
  using (
    (select private.is_admin())
    or (
      property_id is not null
      and entity_type in ('documents', 'property_access', 'leases')
      and (select private.can_access_property(property_id))
    )
  );

comment on table public.tenants is
  'People who rent a long-term property. Access follows leases on assigned properties, plus rows the current user created.';

comment on table public.leases is
  'A fixed-term lease on a long-term property. At most one row per property may be active.';
