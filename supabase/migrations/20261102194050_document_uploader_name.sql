-- Show the signed-in user's own email when their profile has no full name.
-- Other people's email addresses stay hidden from property managers.

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
