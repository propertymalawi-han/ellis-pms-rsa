-- Portfolio reporting for owners and partners.
--
-- Property managers can read payments, statements and expenses for their
-- properties, but not purchase price, bond details or ROI. These reports
-- therefore live behind private.can_read_financials() and are not left to
-- table RLS alone. The views are security invoker and only call those
-- functions. The functions are security definer, in the private schema, and
-- return no rows unless the caller is an owner, a partner, the service role,
-- or the database owner.
--
-- Income is cash received: long-term payments on payment_date, short-term
-- net payout on the statement month.
-- Expenses are recognised on paid_date when paid, otherwise on due_date.
-- A paid row contributes amount_paid. An unpaid row contributes total.
-- Operating expenses exclude Bond interest and Furniture & equipment
-- (capital). The bond instalment comes from properties.bond_monthly_payment
-- so interest is not counted twice, and capital purchases stay out of net
-- income.
--
-- Yields use the PROJECT_SPEC formulas on annual figures. A 365- or 366-day
-- range is already a year. Any other range is a run-rate (amount * 365 / days).
-- Rounding matches src/lib/roi.ts: half away from zero.

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

create or replace function private.can_read_financials()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or coalesce((select auth.role()), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin');
$$;

comment on function private.can_read_financials() is
  'Owners, partners, the service role, and the database owner. API sessions run as authenticator, so a property manager does not pass.';

revoke all on function private.can_read_financials() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared rounding. Same results as src/lib/roi.ts.
-- ---------------------------------------------------------------------------

create or replace function private.annualise_money(amount numeric, period_days integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when amount is null or period_days is null or period_days <= 0 then null
    when period_days in (365, 366) then round(amount, 2)
    else round(amount * 365 / period_days, 2)
  end;
$$;

create or replace function private.period_bond_payments(monthly numeric, period_days integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when period_days is null or period_days <= 0 then null
    when monthly is null then 0::numeric
    when period_days in (365, 366) then round(monthly * 12, 2)
    else round(monthly * 12 * period_days / 365, 2)
  end;
$$;

create or replace function private.money_ratio(numerator numeric, denominator numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when numerator is null or denominator is null or denominator = 0 then null
    else round(numerator / denominator, 6)
  end;
$$;

revoke all on function private.annualise_money(numeric, integer) from public, anon, authenticated;
revoke all on function private.period_bond_payments(numeric, integer) from public, anon, authenticated;
revoke all on function private.money_ratio(numeric, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Monthly income
-- ---------------------------------------------------------------------------

create or replace function private.monthly_income_by_property()
returns table (
  property_id uuid,
  month date,
  income numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_financials() then
    return;
  end if;

  return query
  select
    combined.property_id,
    combined.month,
    sum(combined.income) as income
  from (
    select
      invoice.property_id,
      date_trunc('month', payment.payment_date)::date as month,
      payment.amount as income
    from public.payments as payment
    join public.invoices as invoice
      on invoice.id = payment.invoice_id
    join public.properties as property
      on property.id = invoice.property_id
    where property.rental_type = 'long_term'

    union all

    select
      statement.property_id,
      statement.period_month as month,
      statement.net_payout as income
    from public.owner_statements as statement
    join public.properties as property
      on property.id = statement.property_id
    where property.rental_type = 'short_term'
  ) as combined
  group by combined.property_id, combined.month;
end;
$$;

create view public.monthly_income_by_property
with (security_invoker = true) as
select
  property_id,
  month,
  income
from private.monthly_income_by_property();

comment on view public.monthly_income_by_property is
  'One row per property per month. Long-term income is tenant payments grouped by payment month. Short-term income is the owner statement net payout for period_month. Owners and partners only.';

-- ---------------------------------------------------------------------------
-- Monthly expenses
-- ---------------------------------------------------------------------------

create index expenses_property_recognition_idx
  on public.expenses (property_id, (coalesce(paid_date, due_date)));

create or replace function private.monthly_expenses_by_property()
returns table (
  property_id uuid,
  month date,
  category_id uuid,
  category_name text,
  sort_order integer,
  amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_financials() then
    return;
  end if;

  return query
  select
    expense.property_id,
    date_trunc('month', coalesce(expense.paid_date, expense.due_date))::date as month,
    category.id as category_id,
    category.name as category_name,
    category.sort_order,
    sum(
      case
        when expense.paid_date is not null then coalesce(expense.amount_paid, expense.total)
        else expense.total
      end
    ) as amount
  from public.expenses as expense
  join public.expense_categories as category
    on category.id = expense.category_id
  group by
    expense.property_id,
    date_trunc('month', coalesce(expense.paid_date, expense.due_date))::date,
    category.id,
    category.name,
    category.sort_order;
end;
$$;

create view public.monthly_expenses_by_property
with (security_invoker = true) as
select
  property_id,
  month,
  category_id,
  category_name,
  sort_order,
  amount
from private.monthly_expenses_by_property();

comment on view public.monthly_expenses_by_property is
  'Expenses by property, month and category. The month is the paid date when the expense is paid, otherwise the due date. Owners and partners only.';

-- ---------------------------------------------------------------------------
-- Property summary for a date range
-- ---------------------------------------------------------------------------

create or replace function private.property_financial_summary(
  from_date date,
  to_date date
)
returns table (
  property_id uuid,
  property_name text,
  rental_type public.rental_type,
  income numeric,
  operating_expenses numeric,
  bond_payments numeric,
  net_income numeric,
  gross_yield numeric,
  net_yield numeric,
  cash_on_cash numeric,
  capital_growth numeric,
  occupancy numeric,
  adr numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date := from_date;
  v_to date := to_date;
  v_days integer;
begin
  if v_from is null or v_to is null or v_from > v_to then
    raise exception 'Choose a start date on or before the end date'
      using errcode = '22023';
  end if;

  if not private.can_read_financials() then
    return;
  end if;

  v_days := (v_to - v_from) + 1;

  return query
  with long_income as (
    select
      invoice.property_id,
      sum(payment.amount) as amount
    from public.payments as payment
    join public.invoices as invoice
      on invoice.id = payment.invoice_id
    where payment.payment_date >= v_from
      and payment.payment_date <= v_to
    group by invoice.property_id
  ),
  short_income as (
    select
      statement.property_id,
      sum(statement.net_payout) as net_payout,
      sum(statement.gross_income) as gross_income,
      sum(statement.nights_booked)::numeric as nights,
      sum(
        extract(
          day from (
            statement.period_month + interval '1 month' - interval '1 day'
          )
        )::numeric
      ) as days_available
    from public.owner_statements as statement
    where statement.period_month >= date_trunc('month', v_from)::date
      and statement.period_month <= date_trunc('month', v_to)::date
    group by statement.property_id
  ),
  operating as (
    select
      expense.property_id,
      sum(
        case
          when expense.paid_date is not null then coalesce(expense.amount_paid, expense.total)
          else expense.total
        end
      ) as amount
    from public.expenses as expense
    join public.expense_categories as category
      on category.id = expense.category_id
    where coalesce(expense.paid_date, expense.due_date) >= v_from
      and coalesce(expense.paid_date, expense.due_date) <= v_to
      and category.name not in (
        'Bond interest',
        'Furniture & equipment (capital)'
      )
    group by expense.property_id
  )
  select
    property.id as property_id,
    property.name as property_name,
    property.rental_type,
    period.income,
    period.operating_expenses,
    annual.bond_payments,
    period.income - period.operating_expenses as net_income,
    private.money_ratio(annual.annual_income, property.purchase_price) as gross_yield,
    private.money_ratio(
      annual.annual_income - annual.annual_opex,
      invested.total_investment
    ) as net_yield,
    private.money_ratio(
      (annual.annual_income - annual.annual_opex)
        - coalesce(property.bond_monthly_payment, 0) * 12,
      equity.cash_invested
    ) as cash_on_cash,
    private.money_ratio(
      property.current_value - property.purchase_price,
      property.purchase_price
    ) as capital_growth,
    case
      when property.rental_type <> 'short_term' then null
      when coalesce(short_income.days_available, 0) <= 0 then null
      else round(short_income.nights / short_income.days_available, 6)
    end as occupancy,
    case
      when property.rental_type <> 'short_term' then null
      when coalesce(short_income.nights, 0) <= 0 then null
      else round(short_income.gross_income / short_income.nights, 2)
    end as adr
  from public.properties as property
  left join long_income
    on long_income.property_id = property.id
  left join short_income
    on short_income.property_id = property.id
  left join operating
    on operating.property_id = property.id
  cross join lateral (
    select
      round(
        coalesce(
          case
            when property.rental_type = 'long_term' then long_income.amount
            else short_income.net_payout
          end,
          0
        ),
        2
      ) as income,
      round(coalesce(operating.amount, 0), 2) as operating_expenses
  ) as period
  cross join lateral (
    select
      case
        when property.purchase_price is null then null
        else property.purchase_price
          + coalesce(property.transfer_costs, 0)
          + coalesce(property.improvement_costs, 0)
      end as total_investment
  ) as invested
  cross join lateral (
    select
      case
        when invested.total_investment is null then null
        when coalesce(property.bond_amount, 0) <= 0 then invested.total_investment
        when invested.total_investment - property.bond_amount <= 0 then null
        else invested.total_investment - property.bond_amount
      end as cash_invested
  ) as equity
  cross join lateral (
    select
      private.annualise_money(period.income, v_days) as annual_income,
      private.annualise_money(period.operating_expenses, v_days) as annual_opex,
      private.period_bond_payments(property.bond_monthly_payment, v_days) as bond_payments
  ) as annual
  order by property.name, property.id;
end;
$$;

comment on function private.property_financial_summary(date, date) is
  'Income, operating expenses, bond instalments and ROI for each property. Gross yield is annual income / purchase price. Net income is income minus operating expenses. Net yield is annual net income / total investment. Cash-on-cash is (annual net income - annual bond instalments) / (total investment - bond amount). Capital growth is (current value - purchase price) / purchase price. Occupancy and ADR are short-term only.';

create or replace function public.property_financial_summary(
  from_date date,
  to_date date
)
returns table (
  property_id uuid,
  property_name text,
  rental_type public.rental_type,
  income numeric,
  operating_expenses numeric,
  bond_payments numeric,
  net_income numeric,
  gross_yield numeric,
  net_yield numeric,
  cash_on_cash numeric,
  capital_growth numeric,
  occupancy numeric,
  adr numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    property_id,
    property_name,
    rental_type,
    income,
    operating_expenses,
    bond_payments,
    net_income,
    gross_yield,
    net_yield,
    cash_on_cash,
    capital_growth,
    occupancy,
    adr
  from private.property_financial_summary(from_date, to_date);
$$;

comment on function public.property_financial_summary(date, date) is
  'Portfolio ROI for a date range. security invoker: the private function decides who can read it. Owners and partners only.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.monthly_income_by_property() from public, anon;
revoke all on function private.monthly_expenses_by_property() from public, anon;
revoke all on function private.property_financial_summary(date, date) from public, anon;
revoke all on function public.property_financial_summary(date, date) from public, anon;

grant execute on function private.monthly_income_by_property() to authenticated, service_role;
grant execute on function private.monthly_expenses_by_property() to authenticated, service_role;
grant execute on function private.property_financial_summary(date, date) to authenticated, service_role;
grant execute on function public.property_financial_summary(date, date) to authenticated, service_role;

revoke all on table public.monthly_income_by_property from public, anon;
revoke all on table public.monthly_expenses_by_property from public, anon;

grant select on table public.monthly_income_by_property to authenticated, service_role;
grant select on table public.monthly_expenses_by_property to authenticated, service_role;
