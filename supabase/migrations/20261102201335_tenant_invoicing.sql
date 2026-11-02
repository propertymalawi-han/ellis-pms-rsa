-- Tenant invoices, line items, payments, and the business details printed on them.
--
-- Paid, partially paid, and overdue are not stored. invoice_display_status()
-- derives them from the balance and the Johannesburg date. `issued` is the
-- only workflow flag: false is a draft, true has been sent. Drafts stay
-- drafts after the due date so a monthly run does not mark unsent rent overdue.
--
-- subtotal, vat_amount, total, amount_paid, invoice_number, and line_total
-- are maintained by triggers. Authenticated users cannot update those invoice
-- columns directly. A transaction-local flag lets the trigger through.
--
-- Owners and partners manage business settings. Anyone who can access the
-- property can create invoices and record payments for it. Payment deletions
-- are admin-only. Activity is written by private.log_activity.

create type public.invoice_status as enum (
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue'
);

create type public.payment_method as enum (
  'eft',
  'cash',
  'card',
  'other'
);

-- ---------------------------------------------------------------------------
-- Business details (one row)
-- ---------------------------------------------------------------------------

create table public.business_settings (
  id integer primary key default 1,
  business_name text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  branch_code text not null default '',
  vat_number text,
  logo_path text,
  payment_terms_days integer not null default 7,
  updated_at timestamptz not null default now(),
  constraint business_settings_singleton check (id = 1),
  constraint business_settings_name_length
    check (char_length(business_name) <= 200),
  constraint business_settings_address_length
    check (char_length(address) <= 500),
  constraint business_settings_phone_length
    check (char_length(phone) <= 40),
  constraint business_settings_email_format
    check (
      email = ''
      or (
        char_length(email) <= 200
        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  constraint business_settings_bank_name_length
    check (char_length(bank_name) <= 120),
  constraint business_settings_account_name_length
    check (char_length(account_name) <= 200),
  constraint business_settings_account_number_format
    check (account_number = '' or account_number ~ '^[0-9]{1,20}$'),
  constraint business_settings_branch_code_format
    check (branch_code = '' or branch_code ~ '^[0-9]{1,10}$'),
  constraint business_settings_vat_number_format
    check (vat_number is null or vat_number ~ '^[0-9]{10}$'),
  constraint business_settings_logo_path_shape
    check (
      logo_path is null
      or logo_path ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
    ),
  constraint business_settings_payment_terms_range
    check (payment_terms_days between 0 and 365)
);

insert into public.business_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  property_id uuid not null references public.properties (id) on delete restrict,
  lease_id uuid not null references public.leases (id) on delete restrict,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  issue_date date not null,
  due_date date not null,
  period_start date not null,
  period_end date not null,
  subtotal numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  issued boolean not null default false,
  notes text,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint invoices_number_shape
    check (invoice_number ~ '^INV-[0-9]{4}-[0-9]{4,}$'),
  constraint invoices_period_order
    check (period_end >= period_start),
  constraint invoices_subtotal_nonnegative
    check (subtotal >= 0),
  constraint invoices_vat_nonnegative
    check (vat_amount >= 0),
  constraint invoices_total_matches
    check (total = subtotal + vat_amount),
  constraint invoices_amount_paid_within_total
    check (amount_paid >= 0 and amount_paid <= total),
  constraint invoices_notes_length
    check (notes is null or char_length(notes) <= 5000),
  constraint invoices_pdf_path_shape
    check (
      pdf_path is null
      or (
        pdf_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
        and lower(split_part(pdf_path, '/', 1)) = property_id::text
      )
    )
);

create unique index invoices_invoice_number_key
  on public.invoices (invoice_number);

create unique index invoices_lease_period_key
  on public.invoices (lease_id, period_start, period_end);

create index invoices_property_id_idx
  on public.invoices (property_id);

create index invoices_lease_id_idx
  on public.invoices (lease_id);

create index invoices_tenant_id_idx
  on public.invoices (tenant_id);

create index invoices_created_by_idx
  on public.invoices (created_by);

create index invoices_property_period_idx
  on public.invoices (property_id, period_start);

create index invoices_due_date_idx
  on public.invoices (due_date);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(14, 2) not null,
  vat_applicable boolean not null default false,
  line_total numeric(14, 2) not null default 0,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint invoice_items_description_length
    check (char_length(description) between 1 and 200),
  constraint invoice_items_quantity_positive
    check (quantity > 0 and quantity <= 999999.99),
  constraint invoice_items_unit_price_nonnegative
    check (unit_price >= 0),
  constraint invoice_items_line_total_nonnegative
    check (line_total >= 0),
  constraint invoice_items_position_range
    check (position >= 0 and position < 50)
);

create index invoice_items_invoice_id_idx
  on public.invoice_items (invoice_id, position);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(14, 2) not null,
  payment_date date not null,
  method public.payment_method not null,
  reference text,
  proof_file_path text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint payments_amount_positive
    check (amount > 0),
  constraint payments_reference_length
    check (reference is null or char_length(reference) between 1 and 120),
  constraint payments_proof_path_shape
    check (
      proof_file_path is null
      or proof_file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
    )
);

create index payments_invoice_id_idx
  on public.payments (invoice_id);

create index payments_created_by_idx
  on public.payments (created_by);

create index payments_payment_date_idx
  on public.payments (payment_date);

-- ---------------------------------------------------------------------------
-- Invoice numbers: INV-2026-0001, per issue-date year
-- ---------------------------------------------------------------------------

create table private.invoice_counters (
  year integer primary key,
  last_value integer not null,
  constraint invoice_counters_year_range
    check (year between 2000 and 2100),
  constraint invoice_counters_last_value_positive
    check (last_value > 0)
);

revoke all on table private.invoice_counters from public, anon, authenticated;

create or replace function private.next_invoice_number(p_issue_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_next integer;
begin
  v_year := extract(year from p_issue_date)::integer;

  if v_year < 2000 or v_year > 2100 then
    raise exception 'Issue date is out of range'
      using errcode = '22023';
  end if;

  insert into private.invoice_counters as c (year, last_value)
  values (v_year, 1)
  on conflict (year) do update
    set last_value = c.last_value + 1
  returning last_value into v_next;

  return 'INV-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Status
-- ---------------------------------------------------------------------------

create or replace function public.invoice_display_status(
  p_issued boolean,
  p_total numeric,
  p_amount_paid numeric,
  p_due_date date
)
returns public.invoice_status
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_total > 0 and p_amount_paid >= p_total then 'paid'::public.invoice_status
    when p_amount_paid > 0 then 'partially_paid'::public.invoice_status
    when p_issued
      and p_due_date < (timezone('Africa/Johannesburg', now()))::date
      then 'overdue'::public.invoice_status
    when p_issued then 'sent'::public.invoice_status
    else 'draft'::public.invoice_status
  end;
$$;

comment on function public.invoice_display_status(boolean, numeric, numeric, date) is
  'Paid when the balance is cleared, partially paid when some money is in, overdue when a sent invoice is unpaid past its due date. Drafts stay drafts.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.invoices_prepare_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.issue_date is null then
    raise exception 'Enter an issue date'
      using errcode = '23514';
  end if;

  new.invoice_number := private.next_invoice_number(new.issue_date);
  new.subtotal := 0;
  new.vat_amount := 0;
  new.total := 0;
  new.amount_paid := 0;
  new.pdf_path := null;
  return new;
end;
$$;

create or replace function private.invoices_require_lease()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One invoice writer per lease at a time, so overlapping periods cannot race.
  perform 1
  from public.leases as l
  where l.id = new.lease_id
  for update;

  if not exists (
    select 1
    from public.leases as l
    where l.id = new.lease_id
      and l.property_id = new.property_id
      and l.tenant_id = new.tenant_id
  ) then
    raise exception 'Invoice does not match the lease'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.invoices as i
    where i.lease_id = new.lease_id
      and i.id is distinct from new.id
      and i.period_start <= new.period_end
      and i.period_end >= new.period_start
  ) then
    raise exception 'This lease already has an invoice for that period'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function private.invoices_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('ellis.invoice_sync', true) = '1' then
    if new.id is distinct from old.id
      or new.invoice_number is distinct from old.invoice_number
      or new.property_id is distinct from old.property_id
      or new.lease_id is distinct from old.lease_id
      or new.tenant_id is distinct from old.tenant_id
      or new.issue_date is distinct from old.issue_date
      or new.due_date is distinct from old.due_date
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.issued is distinct from old.issued
      or new.notes is distinct from old.notes
      or new.pdf_path is distinct from old.pdf_path
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Invoice totals sync changed unexpected fields'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
    or new.invoice_number is distinct from old.invoice_number
    or new.property_id is distinct from old.property_id
    or new.lease_id is distinct from old.lease_id
    or new.tenant_id is distinct from old.tenant_id
    or new.subtotal is distinct from old.subtotal
    or new.vat_amount is distinct from old.vat_amount
    or new.total is distinct from old.total
    or new.amount_paid is distinct from old.amount_paid
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
  then
    raise exception 'Invoice identity and totals cannot be edited directly'
      using errcode = '42501';
  end if;

  if old.issued
    and not new.issued
    and old.amount_paid > 0
  then
    raise exception 'An invoice with payments cannot return to draft'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.invoices_mark_deleting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ellis.invoice_deleting', old.id::text, true);
  return old;
end;
$$;

create or replace function private.sync_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric(14, 2);
  v_vat numeric(14, 2);
begin
  if current_setting('ellis.invoice_deleting', true) = p_invoice_id::text then
    return;
  end if;

  if not exists (
    select 1
    from public.invoices as i
    where i.id = p_invoice_id
  ) then
    return;
  end if;

  select
    coalesce(sum(item.line_total), 0)::numeric(14, 2),
    coalesce(sum(
      case
        when item.vat_applicable then round(item.line_total * 0.15, 2)
        else 0
      end
    ), 0)::numeric(14, 2)
  into v_subtotal, v_vat
  from public.invoice_items as item
  where item.invoice_id = p_invoice_id;

  perform set_config('ellis.invoice_sync', '1', true);

  update public.invoices
  set
    subtotal = v_subtotal,
    vat_amount = v_vat,
    total = v_subtotal + v_vat
  where id = p_invoice_id;

  perform set_config('ellis.invoice_sync', '', true);
end;
$$;

create or replace function private.sync_invoice_amount_paid(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid numeric(14, 2);
begin
  if current_setting('ellis.invoice_deleting', true) = p_invoice_id::text then
    return;
  end if;

  if not exists (
    select 1
    from public.invoices as i
    where i.id = p_invoice_id
  ) then
    return;
  end if;

  select coalesce(sum(payment.amount), 0)::numeric(14, 2)
  into v_paid
  from public.payments as payment
  where payment.invoice_id = p_invoice_id;

  perform set_config('ellis.invoice_sync', '1', true);

  update public.invoices
  set amount_paid = v_paid
  where id = p_invoice_id;

  perform set_config('ellis.invoice_sync', '', true);
end;
$$;

create or replace function private.invoice_items_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_paid numeric(14, 2);
  v_count integer;
begin
  v_invoice_id := case
    when tg_op = 'DELETE' then old.invoice_id
    else new.invoice_id
  end;

  select i.amount_paid
  into v_paid
  from public.invoices as i
  where i.id = v_invoice_id
  for update;

  if v_paid is null then
    raise exception 'Invoice not found'
      using errcode = '42501';
  end if;

  if v_paid > 0 then
    raise exception 'This invoice has payments, so its lines cannot change'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'A line cannot move to another invoice'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    into v_count
    from public.invoice_items as item
    where item.invoice_id = new.invoice_id;

    if v_count >= 30 then
      raise exception 'An invoice can have at most 30 lines'
        using errcode = '23514';
    end if;
  end if;

  new.line_total := round(new.quantity * new.unit_price, 2);
  return new;
end;
$$;

create or replace function private.invoice_items_sync_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_invoice_totals(
    case
      when tg_op = 'DELETE' then old.invoice_id
      else new.invoice_id
    end
  );

  return coalesce(new, old);
end;
$$;

create or replace function private.payments_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(14, 2);
  v_paid numeric(14, 2);
  v_property_id uuid;
begin
  select i.total, i.amount_paid, i.property_id
  into v_total, v_paid, v_property_id
  from public.invoices as i
  where i.id = new.invoice_id
  for update;

  if v_property_id is null then
    raise exception 'Invoice not found'
      using errcode = '42501';
  end if;

  if v_total <= 0 then
    raise exception 'Add invoice lines before recording a payment'
      using errcode = '23514';
  end if;

  if v_paid + new.amount > v_total then
    raise exception 'Payment exceeds the balance due'
      using errcode = '23514';
  end if;

  if new.proof_file_path is not null
    and lower(split_part(new.proof_file_path, '/', 1)) is distinct from v_property_id::text
  then
    raise exception 'Proof of payment does not belong to this property'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.payments_sync_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_invoice_amount_paid(
    case
      when tg_op = 'DELETE' then old.invoice_id
      else new.invoice_id
    end
  );

  return coalesce(new, old);
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
  elsif tg_table_name in ('documents', 'leases', 'invoices') then
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
    select i.property_id
    into v_property_id
    from public.invoices as i
    where i.id = (v_row ->> 'invoice_id')::uuid;
  else
    v_entity_id := null;
    v_property_id := null;
  end if;

  if v_property_id is not null
    and not exists (
      select 1
      from public.properties as p
      where p.id = v_property_id
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

create trigger business_settings_set_updated_at
  before update on public.business_settings
  for each row execute function private.set_updated_at();

create trigger business_settings_log_activity
  after update on public.business_settings
  for each row execute function private.log_activity();

create trigger invoices_prepare_insert
  before insert on public.invoices
  for each row execute function private.invoices_prepare_insert();

create trigger invoices_require_lease
  before insert or update of lease_id, property_id, tenant_id, period_start, period_end
  on public.invoices
  for each row execute function private.invoices_require_lease();

create trigger invoices_guard_update
  before update on public.invoices
  for each row execute function private.invoices_guard_update();

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function private.set_updated_at();

create trigger invoices_mark_deleting
  before delete on public.invoices
  for each row execute function private.invoices_mark_deleting();

create trigger invoices_log_activity
  after insert or update or delete on public.invoices
  for each row execute function private.log_activity();

create trigger invoice_items_prepare
  before insert or update or delete on public.invoice_items
  for each row execute function private.invoice_items_prepare();

create trigger invoice_items_sync_totals
  after insert or update or delete on public.invoice_items
  for each row execute function private.invoice_items_sync_totals();

create trigger invoice_items_log_activity
  after insert or update or delete on public.invoice_items
  for each row execute function private.log_activity();

create trigger payments_prepare
  before insert on public.payments
  for each row execute function private.payments_prepare();

create trigger payments_sync_amount_paid
  after insert or delete on public.payments
  for each row execute function private.payments_sync_amount_paid();

create trigger payments_log_activity
  after insert or update or delete on public.payments
  for each row execute function private.log_activity();

-- ---------------------------------------------------------------------------
-- Monthly rent run
-- ---------------------------------------------------------------------------

create or replace function private.rent_run_candidates(
  p_period_start date,
  p_period_end date
)
returns table (
  lease_id uuid,
  property_id uuid,
  tenant_id uuid,
  monthly_rent numeric,
  rent_due_day smallint,
  already_invoiced boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id as lease_id,
    l.property_id,
    l.tenant_id,
    l.monthly_rent,
    l.rent_due_day,
    exists (
      select 1
      from public.invoices as i
      where i.lease_id = l.id
        and i.period_start <= p_period_end
        and i.period_end >= p_period_start
    ) as already_invoiced
  from public.leases as l
  join public.properties as p
    on p.id = l.property_id
  where l.status = 'active'
    and p.status = 'active'
    and p.rental_type = 'long_term'
    and l.start_date <= p_period_end
    and l.end_date >= p_period_start
    and private.can_access_property(l.property_id);
$$;

create or replace function public.generate_monthly_rent_invoices(
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lease record;
  v_invoice_id uuid;
  v_issue date;
  v_due date;
  v_day integer;
  v_created uuid[] := '{}'::uuid[];
  v_skipped integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
    or p_period_start <> date_trunc('month', p_period_start)::date
    or p_period_end <> (date_trunc('month', p_period_start) + interval '1 month' - interval '1 day')::date
  then
    raise exception 'Rent invoices cover one calendar month'
      using errcode = '22023';
  end if;

  v_issue := (timezone('Africa/Johannesburg', now()))::date;

  for v_lease in
    select *
    from private.rent_run_candidates(p_period_start, p_period_end)
  loop
    if v_lease.already_invoiced then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_day := least(
      v_lease.rent_due_day,
      extract(day from p_period_end)::integer
    );
    v_due := make_date(
      extract(year from p_period_start)::integer,
      extract(month from p_period_start)::integer,
      v_day
    );

    begin
      insert into public.invoices (
        property_id,
        lease_id,
        tenant_id,
        issue_date,
        due_date,
        period_start,
        period_end,
        issued,
        created_by
      )
      values (
        v_lease.property_id,
        v_lease.lease_id,
        v_lease.tenant_id,
        v_issue,
        v_due,
        p_period_start,
        p_period_end,
        false,
        (select auth.uid())
      )
      returning id into v_invoice_id;

      insert into public.invoice_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        vat_applicable,
        position
      )
      values (
        v_invoice_id,
        'Rent',
        1,
        v_lease.monthly_rent,
        false,
        0
      );

      v_created := array_append(v_created, v_invoice_id);
    exception
      when unique_violation then
        v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'invoice_ids', to_jsonb(v_created),
    'skipped', v_skipped
  );
end;
$$;

comment on function public.generate_monthly_rent_invoices(date, date) is
  'Creates a draft rent invoice for each active long-term lease that does not already have an invoice overlapping the month. Due date is the lease rent due day.';

-- ---------------------------------------------------------------------------
-- Read model. Property managers cannot select public.properties, so names
-- are resolved in a definer function that still applies can_access_property.
-- ---------------------------------------------------------------------------

create or replace function private.can_access_invoice(target_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invoices as i
    where i.id = target_invoice_id
      and private.can_access_property(i.property_id)
  );
$$;

create or replace function private.accessible_invoices()
returns table (
  id uuid,
  invoice_number text,
  property_id uuid,
  property_name text,
  lease_id uuid,
  tenant_id uuid,
  tenant_name text,
  issue_date date,
  due_date date,
  period_start date,
  period_end date,
  subtotal numeric,
  vat_amount numeric,
  total numeric,
  amount_paid numeric,
  issued boolean,
  status public.invoice_status,
  notes text,
  pdf_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.invoice_number,
    i.property_id,
    p.name as property_name,
    i.lease_id,
    i.tenant_id,
    t.full_name as tenant_name,
    i.issue_date,
    i.due_date,
    i.period_start,
    i.period_end,
    i.subtotal,
    i.vat_amount,
    i.total,
    i.amount_paid,
    i.issued,
    public.invoice_display_status(i.issued, i.total, i.amount_paid, i.due_date) as status,
    i.notes,
    i.pdf_path,
    i.created_at
  from public.invoices as i
  join public.properties as p
    on p.id = i.property_id
  join public.tenants as t
    on t.id = i.tenant_id
  where private.can_access_property(i.property_id);
$$;

create view public.invoices_list
with (security_invoker = true) as
select
  id,
  invoice_number,
  property_id,
  property_name,
  lease_id,
  tenant_id,
  tenant_name,
  issue_date,
  due_date,
  period_start,
  period_end,
  subtotal,
  vat_amount,
  total,
  amount_paid,
  issued,
  status,
  notes,
  pdf_path,
  created_at
from private.accessible_invoices();

comment on view public.invoices_list is
  'Invoices the current user can access, with property and tenant names and the computed status. security_invoker: callers need execute on private.accessible_invoices().';

-- ---------------------------------------------------------------------------
-- Storage metadata for proofs, PDFs, and the logo
-- ---------------------------------------------------------------------------

create or replace function private.invoice_storage_file(object_path text)
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
    and obj.bucket_id = 'invoices'
    and obj.name = object_path
    and obj.owner = (select auth.uid())
    and (
      private.can_access_object('invoices', object_path)
      or (
        (select private.is_admin())
        and object_path ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
      )
    );
$$;

create or replace function private.remove_unlinked_invoice_file(object_path text)
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

  if not (
    private.can_access_object('invoices', object_path)
    or (
      (select private.is_admin())
      and object_path ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
    )
  ) then
    raise exception 'File not found'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.payments as payment
    where payment.proof_file_path = object_path
  )
  or exists (
    select 1
    from public.invoices as invoice
    where invoice.pdf_path = object_path
  )
  or exists (
    select 1
    from public.business_settings as settings
    where settings.logo_path = object_path
  ) then
    raise exception 'File is already saved'
      using errcode = '42501';
  end if;

  delete from storage.objects as obj
  where obj.bucket_id = 'invoices'
    and obj.name = object_path
    and obj.owner = (select auth.uid());

  if not found then
    raise exception 'File not found'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.invoice_storage_file(object_path text)
returns table (file_size bigint, mime_type text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select result.file_size, result.mime_type
  from private.invoice_storage_file(object_path) as result;
end;
$$;

create or replace function public.remove_unlinked_invoice_file(object_path text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.remove_unlinked_invoice_file(object_path);
end;
$$;

-- Replaces every line on a draft in one transaction. A failed line does not
-- leave the invoice empty.
create or replace function public.replace_invoice_lines(
  p_invoice_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line jsonb;
  v_index integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if not private.can_access_invoice(p_invoice_id) then
    raise exception 'Invoice not found'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 30
  then
    raise exception 'Add between 1 and 30 lines'
      using errcode = '23514';
  end if;

  delete from public.invoice_items
  where invoice_id = p_invoice_id;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    insert into public.invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      vat_applicable,
      position
    )
    values (
      p_invoice_id,
      v_line ->> 'description',
      (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_price')::numeric,
      coalesce((v_line ->> 'vat_applicable')::boolean, false),
      v_index
    );

    v_index := v_index + 1;
  end loop;
end;
$$;

revoke all on function public.replace_invoice_lines(uuid, jsonb) from public, anon;
grant execute on function public.replace_invoice_lines(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.next_invoice_number(date) from public, anon;
revoke all on function private.invoices_prepare_insert() from public, anon;
revoke all on function private.invoices_require_lease() from public, anon;
revoke all on function private.invoices_guard_update() from public, anon;
revoke all on function private.invoices_mark_deleting() from public, anon;
revoke all on function private.sync_invoice_totals(uuid) from public, anon;
revoke all on function private.sync_invoice_amount_paid(uuid) from public, anon;
revoke all on function private.invoice_items_prepare() from public, anon;
revoke all on function private.invoice_items_sync_totals() from public, anon;
revoke all on function private.payments_prepare() from public, anon;
revoke all on function private.payments_sync_amount_paid() from public, anon;
revoke all on function private.rent_run_candidates(date, date) from public, anon;
revoke all on function private.can_access_invoice(uuid) from public, anon;
revoke all on function private.accessible_invoices() from public, anon;
revoke all on function private.invoice_storage_file(text) from public, anon;
revoke all on function private.remove_unlinked_invoice_file(text) from public, anon;
revoke all on function public.invoice_display_status(boolean, numeric, numeric, date) from public, anon;
revoke all on function public.generate_monthly_rent_invoices(date, date) from public, anon;
revoke all on function public.invoice_storage_file(text) from public, anon;
revoke all on function public.remove_unlinked_invoice_file(text) from public, anon;

grant execute on function private.next_invoice_number(date) to authenticated, service_role;
grant execute on function private.invoices_prepare_insert() to authenticated, service_role;
grant execute on function private.invoices_require_lease() to authenticated, service_role;
grant execute on function private.invoices_guard_update() to authenticated, service_role;
grant execute on function private.invoices_mark_deleting() to authenticated, service_role;
grant execute on function private.sync_invoice_totals(uuid) to authenticated, service_role;
grant execute on function private.sync_invoice_amount_paid(uuid) to authenticated, service_role;
grant execute on function private.invoice_items_prepare() to authenticated, service_role;
grant execute on function private.invoice_items_sync_totals() to authenticated, service_role;
grant execute on function private.payments_prepare() to authenticated, service_role;
grant execute on function private.payments_sync_amount_paid() to authenticated, service_role;
grant execute on function private.rent_run_candidates(date, date) to authenticated, service_role;
grant execute on function private.can_access_invoice(uuid) to authenticated, service_role;
grant execute on function private.accessible_invoices() to authenticated, service_role;
grant execute on function private.invoice_storage_file(text) to authenticated, service_role;
grant execute on function private.remove_unlinked_invoice_file(text) to authenticated, service_role;
grant execute on function public.invoice_display_status(boolean, numeric, numeric, date) to authenticated, service_role;
grant execute on function public.generate_monthly_rent_invoices(date, date) to authenticated, service_role;
grant execute on function public.invoice_storage_file(text) to authenticated, service_role;
grant execute on function public.remove_unlinked_invoice_file(text) to authenticated, service_role;

revoke all on table public.business_settings from public, anon;
revoke all on table public.invoices from public, anon;
revoke all on table public.invoice_items from public, anon;
revoke all on table public.payments from public, anon;
revoke all on table public.invoices_list from public, anon;

grant select, update on table public.business_settings to authenticated;
grant select, insert, update, delete on table public.business_settings to service_role;
grant select, insert, delete on table public.invoices to authenticated, service_role;
grant update (
  issue_date,
  due_date,
  period_start,
  period_end,
  notes,
  issued,
  pdf_path,
  updated_at
) on table public.invoices to authenticated;
grant update on table public.invoices to service_role;
grant select, insert, update, delete on table public.invoice_items to authenticated, service_role;
grant select, insert, delete on table public.payments to authenticated, service_role;
grant select on table public.invoices_list to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.business_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy business_settings_select
  on public.business_settings
  for select
  to authenticated
  using (true);

create policy business_settings_update
  on public.business_settings
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy invoices_select
  on public.invoices
  for select
  to authenticated
  using ((select private.can_access_property(property_id)));

create policy invoices_insert
  on public.invoices
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_access_property(property_id))
  );

create policy invoices_update
  on public.invoices
  for update
  to authenticated
  using ((select private.can_access_property(property_id)))
  with check ((select private.can_access_property(property_id)));

create policy invoices_delete
  on public.invoices
  for delete
  to authenticated
  using (
    issued = false
    and amount_paid = 0
    and (select private.can_access_property(property_id))
  );

create policy invoice_items_select
  on public.invoice_items
  for select
  to authenticated
  using ((select private.can_access_invoice(invoice_id)));

create policy invoice_items_insert
  on public.invoice_items
  for insert
  to authenticated
  with check ((select private.can_access_invoice(invoice_id)));

create policy invoice_items_update
  on public.invoice_items
  for update
  to authenticated
  using ((select private.can_access_invoice(invoice_id)))
  with check ((select private.can_access_invoice(invoice_id)));

create policy invoice_items_delete
  on public.invoice_items
  for delete
  to authenticated
  using ((select private.can_access_invoice(invoice_id)));

create policy payments_select
  on public.payments
  for select
  to authenticated
  using ((select private.can_access_invoice(invoice_id)));

create policy payments_insert
  on public.payments
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_access_invoice(invoice_id))
  );

create policy payments_delete
  on public.payments
  for delete
  to authenticated
  using (
    (select private.is_admin())
    and (select private.can_access_invoice(invoice_id))
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
        'payments'
      )
      and (select private.can_access_property(property_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Invoices bucket: property files plus the business logo
-- ---------------------------------------------------------------------------

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
where id = 'invoices';

create policy invoice_branding_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and name ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
  );

create policy invoice_branding_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'invoices'
    and (select private.is_admin())
    and name ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
  );

create policy invoice_branding_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'invoices'
    and (select private.is_admin())
    and name ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
  )
  with check (
    bucket_id = 'invoices'
    and (select private.is_admin())
    and name ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
  );

create policy invoice_branding_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'invoices'
    and (select private.is_admin())
    and name ~ '^branding/[0-9]{13}-[A-Za-z0-9._-]{1,80}$'
  );

comment on table public.invoices is
  'Tenant invoices. Status is computed by invoice_display_status(); issued distinguishes draft from sent. Totals and amount_paid are trigger-maintained.';

comment on table public.invoice_items is
  'Invoice lines. line_total is quantity times unit price, rounded to cents. VAT is 15% of line_total when vat_applicable is true.';

comment on table public.payments is
  'Money received against an invoice. amount_paid on the invoice is the sum of these rows. Partial payments are allowed until the total is reached.';

comment on table public.business_settings is
  'Letterhead, banking details, and default payment terms printed on invoices. One row. Editable by owners and partners.';
