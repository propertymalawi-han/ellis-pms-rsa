-- Property documents: 20 MB PDF/JPG/PNG/WebP, admin-only removal.
-- Uploads and deletes are written to activity_log by the existing
-- documents_log_activity trigger (insert and delete). Renames and category
-- changes are logged as updates by the same trigger.

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
where id = 'property-documents';

alter table public.documents
  drop constraint documents_file_size_nonnegative;

alter table public.documents
  add constraint documents_file_size_range
    check (file_size is null or (file_size > 0 and file_size <= 20971520));

alter table public.documents
  add constraint documents_mime_type_allowed
    check (
      mime_type is null
      or mime_type in (
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    );

alter table public.documents
  add constraint documents_file_path_shape
    check (
      file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
    );

create unique index documents_file_path_key
  on public.documents (file_path);

-- Only the display name and category may change after upload.
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

drop trigger if exists documents_guard_update on public.documents;

create trigger documents_guard_update
  before update on public.documents
  for each row execute function private.documents_guard_update();

drop policy documents_delete on public.documents;

create policy documents_delete
  on public.documents
  for delete
  to authenticated
  using (
    (select private.is_admin())
    and (select private.can_access_property(property_id))
  );

-- Property managers can add files. Only admins can replace or remove them,
-- so a document row cannot be left pointing at bytes someone else swapped.
drop policy property_files_update on storage.objects;
drop policy property_files_delete on storage.objects;

create policy property_files_update
  on storage.objects
  for update
  to authenticated
  using (
    (select private.can_access_object(bucket_id, name))
    and (
      bucket_id <> 'property-documents'
      or (select private.is_admin())
    )
  )
  with check (
    (select private.can_access_object(bucket_id, name))
    and (
      bucket_id <> 'property-documents'
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
      bucket_id <> 'property-documents'
      or (select private.is_admin())
    )
  );

-- Uploader names for people the caller cannot read on profiles.
create or replace function private.accessible_documents()
returns table (
  id uuid,
  property_id uuid,
  property_name text,
  category public.document_category,
  name text,
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
    d.file_size,
    d.created_at,
    coalesce(nullif(trim(uploader.full_name), ''), 'Unknown') as uploaded_by_name
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
  file_size,
  created_at,
  uploaded_by_name
from private.accessible_documents();

comment on view public.documents_list is
  'Documents the current user can access, with property and uploader names. security_invoker: callers need execute on private.accessible_documents().';

-- Metadata for a file the current user just uploaded, before a documents row exists.
create or replace function private.property_document_file(object_path text)
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
    and obj.bucket_id = 'property-documents'
    and obj.name = object_path
    and obj.owner = (select auth.uid())
    and private.can_access_object('property-documents', object_path);
$$;

-- Removes an upload that never became a documents row. Saved files stay put.
create or replace function private.remove_unlinked_property_document(object_path text)
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

  if not private.can_access_object('property-documents', object_path) then
    raise exception 'Document not found'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.documents as d
    where d.file_path = object_path
  ) then
    raise exception 'Document is already saved'
      using errcode = '42501';
  end if;

  delete from storage.objects as obj
  where obj.bucket_id = 'property-documents'
    and obj.name = object_path
    and obj.owner = (select auth.uid());

  if not found then
    raise exception 'Document not found'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.property_document_file(object_path text)
returns table (file_size bigint, mime_type text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select result.file_size, result.mime_type
  from private.property_document_file(object_path) as result;
end;
$$;

create or replace function public.remove_unlinked_property_document(object_path text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.remove_unlinked_property_document(object_path);
end;
$$;

revoke all on function private.documents_guard_update() from public, anon;
revoke all on function private.accessible_documents() from public, anon;
revoke all on function private.property_document_file(text) from public, anon;
revoke all on function private.remove_unlinked_property_document(text) from public, anon;
revoke all on function public.property_document_file(text) from public, anon;
revoke all on function public.remove_unlinked_property_document(text) from public, anon;

grant execute on function private.documents_guard_update() to authenticated, service_role;
grant execute on function private.accessible_documents() to authenticated, service_role;
grant execute on function private.property_document_file(text) to authenticated, service_role;
grant execute on function private.remove_unlinked_property_document(text) to authenticated, service_role;
grant execute on function public.property_document_file(text) to authenticated, service_role;
grant execute on function public.remove_unlinked_property_document(text) to authenticated, service_role;

revoke all on table public.documents_list from public, anon;
grant select on table public.documents_list to authenticated, service_role;

comment on function public.remove_unlinked_property_document(text) is
  'Deletes a property-documents object owned by the current user when no documents row points at it.';
