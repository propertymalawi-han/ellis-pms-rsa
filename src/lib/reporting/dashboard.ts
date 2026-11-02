import { getActor } from "@/lib/auth/access";
import { balanceCents, centsToMoney } from "@/lib/invoices/calc";
import { LEASE_EXPIRY_WARNING_DAYS } from "@/lib/leases/warnings";
import { SIGNED_MONEY, parseDecimal } from "@/lib/money";
import type { PropertyType, RentalType } from "@/lib/properties/labels";
import {
  comparisonRows,
  expenseBreakdown,
  monthlyFlows,
  portfolioFigures,
  shortTermMonths,
  type ComparisonRow,
  type ExpenseBreakdown,
  type MonthFlow,
  type PortfolioFigures,
  type PortfolioProperty,
  type ShortTermMonth,
  type StatementMonth,
} from "@/lib/reporting/aggregate";
import {
  buildAttention,
  type AttentionBill,
  type AttentionExpense,
  type AttentionInvoice,
  type AttentionLease,
  type AttentionPanel,
  type AttentionProperty,
} from "@/lib/reporting/attention";
import {
  inclusiveDayCount,
  monthStartIso,
  previousMonthStart,
  shiftIsoDate,
  type DateRange,
} from "@/lib/reporting/period";
import {
  getPropertyFinancialSummary,
  listMonthlyExpenses,
  listMonthlyIncome,
} from "@/lib/reporting/queries";

export type DashboardReport = {
  figures: PortfolioFigures;
  rows: ComparisonRow[];
  flows: MonthFlow[];
  expenses: ExpenseBreakdown;
  shortTerm: ShortTermMonth[];
  shortTermCount: number;
};

export type DashboardLoad = {
  report: { ok: true; data: DashboardReport } | { ok: false; message: string };
  attention: { ok: true; panel: AttentionPanel } | { ok: false; message: string };
};

type OpenStatus = "due" | "paid" | "overdue";

export async function loadDashboard(range: DateRange, today: string): Promise<DashboardLoad> {
  const actor = await getActor();

  if (!actor.ok) {
    return { report: actor, attention: actor };
  }

  if (!actor.isAdmin) {
    const message = "You do not have access to financial reports.";
    return {
      report: { ok: false, message },
      attention: { ok: false, message },
    };
  }

  const days = inclusiveDayCount(range.from, range.to);
  const lastMonth = previousMonthStart(today);
  const fromMonth = monthStartIso(range.from);
  const toMonth = monthStartIso(range.to);
  const horizon = shiftIsoDate(today, LEASE_EXPIRY_WARNING_DAYS);

  if (days === null || !lastMonth || !fromMonth || !toMonth || !horizon) {
    const message = "Enter a valid date.";
    return {
      report: { ok: false, message },
      attention: { ok: false, message },
    };
  }

  const [
    summary,
    income,
    expenses,
    propertiesResult,
    statementsResult,
    invoicesResult,
    expenseResult,
    billResult,
    monthStatementsResult,
    monthBillsResult,
    leasesResult,
    occupiedResult,
  ] = await Promise.all([
    getPropertyFinancialSummary(range),
    listMonthlyIncome(),
    listMonthlyExpenses(),
    actor.supabase
      .from("properties")
      .select(
        "id, name, property_type, rental_type, status, purchase_price, transfer_costs, improvement_costs, current_value, bond_amount",
      )
      .order("name", { ascending: true }),
    actor.supabase
      .from("owner_statements")
      .select("property_id, period_month, nights_booked, gross_income")
      .gte("period_month", fromMonth)
      .lte("period_month", toMonth),
    actor.supabase
      .from("invoices_list")
      .select("id, invoice_number, property_name, tenant_name, due_date, total, amount_paid")
      .eq("status", "overdue")
      .order("due_date", { ascending: true }),
    actor.supabase
      .from("expenses")
      .select("id, property_id, supplier, description, total, due_date, paid_date, status, rates_levies_bill_id")
      .is("paid_date", null)
      .neq("status", "paid"),
    actor.supabase
      .from("rates_levies_bills")
      .select("id, property_id, issuer_name, total_due, due_date, paid_date, status")
      .is("paid_date", null)
      .neq("status", "paid"),
    actor.supabase.from("owner_statements").select("property_id").eq("period_month", lastMonth),
    actor.supabase.from("rates_levies_bills").select("property_id").eq("period_month", lastMonth),
    actor.supabase
      .from("leases")
      .select("id, property_id, end_date, status, tenants(full_name)")
      .eq("status", "active")
      .lte("end_date", horizon),
    actor.supabase
      .from("leases")
      .select("property_id")
      .eq("status", "active")
      .lte("start_date", today)
      .gte("end_date", today),
  ]);

  const properties = propertiesResult.error ? null : mapProperties(propertiesResult.data);

  if (propertiesResult.error) {
    console.error(propertiesResult.error.message);
  }

  const propertyNames = new Map((properties ?? []).map((property) => [property.id, property.name]));

  return {
    report: buildReport({
      days,
      range,
      summary,
      income,
      expenses,
      properties,
      statements: statementsResult.error ? null : mapStatements(statementsResult.data),
      statementsError: statementsResult.error?.message ?? null,
      occupiedIds: occupiedResult.error ? null : occupiedIds(occupiedResult.data),
      occupiedError: occupiedResult.error?.message ?? null,
    }),
    attention: buildAttentionResult({
      today,
      lastMonth,
      properties,
      propertyNames,
      invoices: invoicesResult.error ? null : mapInvoices(invoicesResult.data),
      invoicesError: invoicesResult.error?.message ?? null,
      expenses: expenseResult.error ? null : mapExpenses(expenseResult.data, propertyNames),
      expensesError: expenseResult.error?.message ?? null,
      bills: billResult.error ? null : mapBills(billResult.data, propertyNames),
      billsError: billResult.error?.message ?? null,
      statementPropertyIds: monthStatementsResult.error ? null : idSet(monthStatementsResult.data),
      statementError: monthStatementsResult.error?.message ?? null,
      billPropertyIds: monthBillsResult.error ? null : idSet(monthBillsResult.data),
      billError: monthBillsResult.error?.message ?? null,
      leases: leasesResult.error ? null : mapLeases(leasesResult.data, propertyNames),
      leasesError: leasesResult.error?.message ?? null,
    }),
  };
}

function buildReport(input: {
  days: number;
  range: DateRange;
  summary: Awaited<ReturnType<typeof getPropertyFinancialSummary>>;
  income: Awaited<ReturnType<typeof listMonthlyIncome>>;
  expenses: Awaited<ReturnType<typeof listMonthlyExpenses>>;
  properties: PortfolioProperty[] | null;
  statements: StatementMonth[] | null;
  statementsError: string | null;
  occupiedIds: Set<string> | null;
  occupiedError: string | null;
}): DashboardLoad["report"] {
  if (!input.summary.ok) {
    return input.summary;
  }

  if (!input.income.ok) {
    return input.income;
  }

  if (!input.expenses.ok) {
    return input.expenses;
  }

  if (!input.properties) {
    return { ok: false, message: "Could not load properties." };
  }

  if (input.statementsError || !input.statements) {
    console.error(input.statementsError ?? "Could not read owner's statements.");
    return { ok: false, message: "Could not load owner's statements." };
  }

  if (input.occupiedError || !input.occupiedIds) {
    console.error(input.occupiedError ?? "Could not read leases.");
    return { ok: false, message: "Could not load leases." };
  }

  const active = input.properties.filter((property) => property.status === "active");
  const activeIds = new Set(active.map((property) => property.id));
  const shortTermIds = active
    .filter((property) => property.rentalType === "short_term")
    .map((property) => property.id);

  return {
    ok: true,
    data: {
      figures: portfolioFigures({
        properties: input.properties,
        summaries: input.summary.rows,
        occupiedPropertyIds: input.occupiedIds,
        periodDays: input.days,
      }),
      rows: comparisonRows(input.summary.rows, input.properties),
      flows: monthlyFlows(
        input.income.rows,
        input.expenses.rows,
        activeIds,
        input.range.from,
        input.range.to,
      ),
      expenses: expenseBreakdown(input.expenses.rows, activeIds, input.range.from, input.range.to),
      shortTerm: shortTermMonths(input.statements, shortTermIds, input.range.from, input.range.to),
      shortTermCount: shortTermIds.length,
    },
  };
}

function buildAttentionResult(input: {
  today: string;
  lastMonth: string;
  properties: AttentionProperty[] | null;
  propertyNames: Map<string, string>;
  invoices: AttentionInvoice[] | null;
  invoicesError: string | null;
  expenses: AttentionExpense[] | null;
  expensesError: string | null;
  bills: AttentionBill[] | null;
  billsError: string | null;
  statementPropertyIds: Set<string> | null;
  statementError: string | null;
  billPropertyIds: Set<string> | null;
  billError: string | null;
  leases: AttentionLease[] | null;
  leasesError: string | null;
}): DashboardLoad["attention"] {
  if (!input.properties) {
    return { ok: false, message: "Could not load properties." };
  }

  const failure = firstError([
    [input.invoices, input.invoicesError, "Could not load invoices."],
    [input.expenses, input.expensesError, "Could not load expenses."],
    [input.bills, input.billsError, "Could not load rates and levy bills."],
    [input.statementPropertyIds, input.statementError, "Could not load owner's statements."],
    [input.billPropertyIds, input.billError, "Could not load rates and levy bills."],
    [input.leases, input.leasesError, "Could not load leases."],
  ]);

  if (failure) {
    return { ok: false, message: failure };
  }

  if (
    !input.invoices ||
    !input.expenses ||
    !input.bills ||
    !input.statementPropertyIds ||
    !input.billPropertyIds ||
    !input.leases
  ) {
    return { ok: false, message: "Could not load what needs attention." };
  }

  return {
    ok: true,
    panel: buildAttention({
      today: input.today,
      lastMonth: input.lastMonth,
      invoices: input.invoices,
      expenses: input.expenses,
      bills: input.bills,
      properties: input.properties,
      statementPropertyIds: input.statementPropertyIds,
      billPropertyIds: input.billPropertyIds,
      leases: input.leases,
    }),
  };
}

function firstError(
  checks: readonly [unknown, string | null, string][],
): string | null {
  for (const [value, error, message] of checks) {
    if (error || value === null) {
      if (error) {
        console.error(error);
      }

      return message;
    }
  }

  return null;
}

function mapProperties(
  rows: readonly {
    id: string;
    name: string;
    property_type: string;
    rental_type: string;
    status: string;
    purchase_price: number | null;
    transfer_costs: number | null;
    improvement_costs: number | null;
    current_value: number | null;
    bond_amount: number | null;
  }[] | null,
): PortfolioProperty[] | null {
  const properties: PortfolioProperty[] = [];

  for (const row of rows ?? []) {
    const property = mapProperty(row);

    if (!property) {
      return null;
    }

    properties.push(property);
  }

  return properties;
}

function mapProperty(row: {
  id: string;
  name: string;
  property_type: string;
  rental_type: string;
  status: string;
  purchase_price: number | null;
  transfer_costs: number | null;
  improvement_costs: number | null;
  current_value: number | null;
  bond_amount: number | null;
}): PortfolioProperty | null {
  if (!isPropertyType(row.property_type) || !isRentalType(row.rental_type) || !isPortfolioStatus(row.status)) {
    return null;
  }

  const purchasePrice = optionalMoney(row.purchase_price);
  const transferCosts = optionalMoney(row.transfer_costs);
  const improvementCosts = optionalMoney(row.improvement_costs);
  const currentValue = optionalMoney(row.current_value);
  const bondAmount = optionalMoney(row.bond_amount);

  if (
    (row.purchase_price !== null && purchasePrice === null) ||
    (row.transfer_costs !== null && transferCosts === null) ||
    (row.improvement_costs !== null && improvementCosts === null) ||
    (row.current_value !== null && currentValue === null) ||
    (row.bond_amount !== null && bondAmount === null)
  ) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    propertyType: row.property_type,
    rentalType: row.rental_type,
    status: row.status,
    purchasePrice,
    transferCosts,
    improvementCosts,
    currentValue,
    bondAmount,
  };
}

function mapStatements(
  rows: readonly {
    property_id: string;
    period_month: string;
    nights_booked: number;
    gross_income: number;
  }[] | null,
): StatementMonth[] | null {
  const statements: StatementMonth[] = [];

  for (const row of rows ?? []) {
    const grossIncome = optionalMoney(row.gross_income);

    if (
      !row.property_id ||
      !row.period_month ||
      !Number.isInteger(row.nights_booked) ||
      row.nights_booked < 0 ||
      grossIncome === null
    ) {
      return null;
    }

    statements.push({
      propertyId: row.property_id,
      periodMonth: row.period_month.slice(0, 10),
      nightsBooked: row.nights_booked,
      grossIncome,
    });
  }

  return statements;
}

function mapInvoices(
  rows: readonly {
    id: string | null;
    invoice_number: string | null;
    property_name: string | null;
    tenant_name: string | null;
    due_date: string | null;
    total: number | null;
    amount_paid: number | null;
  }[] | null,
): AttentionInvoice[] {
  const invoices: AttentionInvoice[] = [];

  for (const row of rows ?? []) {
    const total = optionalMoney(row.total);
    const paid = optionalMoney(row.amount_paid);

    if (!row.id || !row.invoice_number || !row.property_name || !row.tenant_name || !row.due_date || !total || !paid) {
      continue;
    }

    invoices.push({
      id: row.id,
      invoiceNumber: row.invoice_number,
      propertyName: row.property_name,
      tenantName: row.tenant_name,
      dueDate: row.due_date.slice(0, 10),
      balance: centsToMoney(balanceCents(total, paid)),
    });
  }

  return invoices;
}

function mapExpenses(
  rows: readonly {
    id: string;
    property_id: string;
    supplier: string | null;
    description: string | null;
    total: number;
    due_date: string;
    paid_date: string | null;
    status: string;
    rates_levies_bill_id: string | null;
  }[] | null,
  names: Map<string, string>,
): AttentionExpense[] {
  const expenses: AttentionExpense[] = [];

  for (const row of rows ?? []) {
    const total = optionalMoney(row.total);

    if (!total || !isOpenStatus(row.status) || !row.due_date) {
      continue;
    }

    expenses.push({
      id: row.id,
      propertyId: row.property_id,
      propertyName: names.get(row.property_id) ?? "Property",
      label: labelOrFallback(row.supplier, row.description, "Expense"),
      dueDate: row.due_date.slice(0, 10),
      total,
      status: row.status,
      paidDate: row.paid_date ? row.paid_date.slice(0, 10) : null,
      billId: row.rates_levies_bill_id,
    });
  }

  return expenses;
}

function mapBills(
  rows: readonly {
    id: string;
    property_id: string;
    issuer_name: string;
    total_due: number;
    due_date: string;
    paid_date: string | null;
    status: string;
  }[] | null,
  names: Map<string, string>,
): AttentionBill[] {
  const bills: AttentionBill[] = [];

  for (const row of rows ?? []) {
    const totalDue = optionalMoney(row.total_due);

    if (!totalDue || !isOpenStatus(row.status) || !row.due_date) {
      continue;
    }

    bills.push({
      id: row.id,
      propertyId: row.property_id,
      propertyName: names.get(row.property_id) ?? "Property",
      issuerName: row.issuer_name.trim() || "Bill",
      dueDate: row.due_date.slice(0, 10),
      totalDue,
      status: row.status,
      paidDate: row.paid_date ? row.paid_date.slice(0, 10) : null,
    });
  }

  return bills;
}

function mapLeases(
  rows: readonly {
    id: string;
    property_id: string;
    end_date: string;
    status: string;
    tenants: { full_name: string } | { full_name: string }[] | null;
  }[] | null,
  names: Map<string, string>,
): AttentionLease[] {
  const leases: AttentionLease[] = [];

  for (const row of rows ?? []) {
    const tenantName = joinedName(row.tenants);

    if (!tenantName || !row.end_date || (row.status !== "active" && row.status !== "ended")) {
      continue;
    }

    leases.push({
      id: row.id,
      propertyId: row.property_id,
      propertyName: names.get(row.property_id) ?? "Property",
      tenantName,
      endDate: row.end_date.slice(0, 10),
      status: row.status,
    });
  }

  return leases;
}

function occupiedIds(rows: readonly { property_id: string }[] | null): Set<string> {
  return new Set((rows ?? []).map((row) => row.property_id));
}

function idSet(rows: readonly { property_id: string }[] | null): Set<string> {
  return new Set((rows ?? []).flatMap((row) => (row.property_id ? [row.property_id] : [])));
}

function optionalMoney(value: number | string | null): string | null {
  if (value === null) {
    return null;
  }

  const text = typeof value === "number" ? value.toFixed(2) : value;
  const parsed = parseDecimal(text, SIGNED_MONEY);

  return parsed.ok ? parsed.canonical : null;
}

function labelOrFallback(
  primary: string | null,
  secondary: string | null,
  fallback: string,
): string {
  const label = primary?.trim() || secondary?.trim();

  return label ? label : fallback;
}

function joinedName(value: { full_name: string } | { full_name: string }[] | null): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.full_name.trim();

  return name ? name : null;
}

function isPropertyType(value: string): value is PropertyType {
  return value === "freehold" || value === "sectional_title";
}

function isRentalType(value: string): value is RentalType {
  return value === "long_term" || value === "short_term";
}

function isPortfolioStatus(value: string): value is "active" | "sold" {
  return value === "active" || value === "sold";
}

function isOpenStatus(value: string): value is OpenStatus {
  return value === "due" || value === "paid" || value === "overdue";
}
