-- Property-scoped list indexes that were not already created by earlier migrations.
-- Existing and left unchanged: property_access(property_id), documents(property_id),
-- leases(property_id), invoices(property_id), activity_log(property_id, entity_type),
-- expenses(property_id, due_date), owner_statements(property_id, period_month),
-- rates_levies_bills(property_id, period_month, bill_type).

create index if not exists expenses_property_status_idx
  on public.expenses (property_id, status);

create index if not exists invoices_property_due_idx
  on public.invoices (property_id, due_date);

create index if not exists leases_property_status_idx
  on public.leases (property_id, status);

create index if not exists owner_statements_property_status_idx
  on public.owner_statements (property_id, status);

create index if not exists rates_levies_bills_property_due_idx
  on public.rates_levies_bills (property_id, due_date);

create index if not exists rates_levies_bills_property_status_idx
  on public.rates_levies_bills (property_id, status);

alter table public.documents
  add column if not exists thumbnail_path text;

alter table public.documents
  drop constraint if exists documents_thumbnail_path_shape;

alter table public.documents
  add constraint documents_thumbnail_path_shape
    check (
      thumbnail_path is null
      or (
        thumbnail_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
        and thumbnail_path ~* '\.thumb\.jpg$'
      )
    );

alter table public.documents
  drop constraint if exists documents_thumbnail_matches_property;

alter table public.documents
  add constraint documents_thumbnail_matches_property
    check (
      thumbnail_path is null
      or lower(split_part(thumbnail_path, '/', 1)) = property_id::text
    );

create unique index if not exists documents_thumbnail_path_key
  on public.documents (thumbnail_path)
  where thumbnail_path is not null;

create or replace function private.documents_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.property_id is distinct from old.property_id
    or new.file_path is distinct from old.file_path
    or new.thumbnail_path is distinct from old.thumbnail_path
    or new.file_size is distinct from old.file_size
    or new.mime_type is distinct from old.mime_type
    or new.uploaded_by is distinct from old.uploaded_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the document name and category can be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop view if exists public.documents_list;
drop function if exists private.accessible_documents();

create function private.accessible_documents()
returns table (
  id uuid,
  property_id uuid,
  property_name text,
  category public.document_category,
  name text,
  file_path text,
  thumbnail_path text,
  mime_type text,
  file_size bigint,
  created_at timestamptz,
  uploaded_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.property_id,
    p.name as property_name,
    d.category,
    d.name,
    d.file_path,
    d.thumbnail_path,
    d.mime_type,
    d.file_size,
    d.created_at,
    coalesce(
      nullif(trim(uploader.full_name), ''),
      case
        when uploader.id = (select auth.uid())
          then nullif(trim(uploader.email), '')
        else null
      end,
      'Unknown'
    ) as uploaded_by_name
  from public.documents as d
  join public.properties as p
    on p.id = d.property_id
  left join public.profiles as uploader
    on uploader.id = d.uploaded_by
  where private.can_access_property(d.property_id);
$$;

create view public.documents_list
with (security_invoker = true) as
select
  id,
  property_id,
  property_name,
  category,
  name,
  file_path,
  thumbnail_path,
  mime_type,
  file_size,
  created_at,
  uploaded_by_name
from private.accessible_documents();

comment on view public.documents_list is
  'Documents the current user can access, with property and uploader names. security_invoker: callers need execute on private.accessible_documents().';

revoke all on function private.accessible_documents() from public, anon;
grant execute on function private.accessible_documents() to authenticated, service_role;

revoke all on table public.documents_list from public, anon;
grant select on table public.documents_list to authenticated, service_role;
