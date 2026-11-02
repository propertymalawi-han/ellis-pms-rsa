-- Login is not a row change, so the activity trigger cannot record it.
-- Authenticated users call public.log_login(); the insert itself runs in
-- private so it does not widen activity_log insert policies.

alter table public.activity_log
  drop constraint activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in ('insert', 'update', 'delete', 'login'));

create or replace function private.log_login()
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

  insert into public.activity_log (
    user_id,
    action,
    entity_type,
    entity_id,
    property_id,
    details
  )
  values (
    (select auth.uid()),
    'login',
    'session',
    (select auth.uid()),
    null,
    '{}'::jsonb
  );
end;
$$;

revoke all on function private.log_login() from public, anon;
grant execute on function private.log_login() to authenticated, service_role;

create or replace function public.log_login()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.log_login();
end;
$$;

revoke all on function public.log_login() from public, anon;
grant execute on function public.log_login() to authenticated, service_role;

comment on function public.log_login() is
  'Writes one activity_log row for the current user. Called after a successful sign-in.';
