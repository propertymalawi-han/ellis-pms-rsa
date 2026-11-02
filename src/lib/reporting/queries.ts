import { getActor } from "@/lib/auth/access";
import { SIGNED_MONEY, parseDecimal, type DecimalSpec } from "@/lib/money";
import type { PeriodSummary, RentalType } from "@/lib/roi";
import {
  inclusiveDayCount,
  parseIsoDate,
  resolvePeriodForToday,
  type DateRange,
  type PeriodPreset,
} from "@/lib/reporting/period";
import type { Database } from "@/types/database";

const RATIO: DecimalSpec = {
  scale: 6,
  maxIntegerDigits: 8,
  allowNegative: true,
};

type SummaryRow =
  Database["public"]["Functions"]["property_financial_summary"]["Returns"][number];
type IncomeRow = Database["public"]["Views"]["monthly_income_by_property"]["Row"];
type ExpenseRow = Database["public"]["Views"]["monthly_expenses_by_property"]["Row"];

export type PropertyFinancialSummary = PeriodSummary & {
  propertyId: string;
  propertyName: string;
  rentalType: RentalType;
};

export type MonthlyIncomeRow = {
  propertyId: string;
  month: string;
  income: string;
};

export type MonthlyExpenseRow = {
  propertyId: string;
  month: string;
  categoryId: string;
  categoryName: string;
  sortOrder: number;
  amount: string;
};

type ReportResult<T> = { ok: true; rows: T[] } | { ok: false; message: string };

export async function listMonthlyIncome(): Promise<ReportResult<MonthlyIncomeRow>> {
  const actor = await reportingActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("monthly_income_by_property")
    .select("property_id, month, income")
    .order("month", { ascending: true });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load monthly income." };
  }

  return mapRows(data, mapIncome, "Could not read monthly income.");
}

export async function listMonthlyExpenses(): Promise<ReportResult<MonthlyExpenseRow>> {
  const actor = await reportingActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("monthly_expenses_by_property")
    .select("property_id, month, category_id, category_name, sort_order, amount")
    .order("month", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load monthly expenses." };
  }

  return mapRows(data, mapExpense, "Could not read monthly expenses.");
}

export async function getPropertyFinancialSummary(
  range: DateRange,
): Promise<ReportResult<PropertyFinancialSummary>> {
  const actor = await reportingActor();

  if (!actor.ok) {
    return actor;
  }

  if (!parseIsoDate(range.from) || !parseIsoDate(range.to)) {
    return { ok: false, message: "Enter a valid date." };
  }

  if (inclusiveDayCount(range.from, range.to) === null) {
    return { ok: false, message: "Choose a start date on or before the end date." };
  }

  const { data, error } = await actor.supabase.rpc("property_financial_summary", {
    from_date: range.from,
    to_date: range.to,
  });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load the financial summary." };
  }

  return mapRows(data, mapSummary, "Could not read the financial summary.");
}

/** Resolves a preset in Africa/Johannesburg, then loads the summary for that range. */
export async function getPropertyFinancialSummaryForPreset(
  preset: PeriodPreset,
  custom?: DateRange,
): Promise<ReportResult<PropertyFinancialSummary>> {
  const period = resolvePeriodForToday(preset, custom);

  if (!period.ok) {
    return period;
  }

  return getPropertyFinancialSummary(period.range);
}

async function reportingActor() {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  if (!actor.isAdmin) {
    return {
      ok: false as const,
      message: "You do not have access to financial reports.",
    };
  }

  return actor;
}

function mapRows<TRow, TResult>(
  rows: TRow[] | null,
  mapRow: (row: TRow) => TResult | null,
  message: string,
): ReportResult<TResult> {
  const mapped: TResult[] = [];

  for (const row of rows ?? []) {
    const next = mapRow(row);

    if (!next) {
      return { ok: false, message };
    }

    mapped.push(next);
  }

  return { ok: true, rows: mapped };
}

function mapIncome(row: IncomeRow): MonthlyIncomeRow | null {
  const income = canonicalMoney(row.income);

  if (!row.property_id || !row.month || income === null) {
    return null;
  }

  return {
    propertyId: row.property_id,
    month: row.month.slice(0, 10),
    income,
  };
}

function mapExpense(row: ExpenseRow): MonthlyExpenseRow | null {
  const amount = canonicalMoney(row.amount);

  if (
    !row.property_id ||
    !row.month ||
    !row.category_id ||
    !row.category_name ||
    row.sort_order === null ||
    amount === null
  ) {
    return null;
  }

  return {
    propertyId: row.property_id,
    month: row.month.slice(0, 10),
    categoryId: row.category_id,
    categoryName: row.category_name,
    sortOrder: row.sort_order,
    amount,
  };
}

function mapSummary(row: SummaryRow): PropertyFinancialSummary | null {
  const income = canonicalMoney(row.income);
  const operatingExpenses = canonicalMoney(row.operating_expenses);
  const bondPayments = canonicalMoney(row.bond_payments);
  const net = canonicalMoney(row.net_income);

  if (
    !row.property_id ||
    !row.property_name ||
    !isRentalType(row.rental_type) ||
    income === null ||
    operatingExpenses === null ||
    bondPayments === null ||
    net === null
  ) {
    return null;
  }

  return {
    propertyId: row.property_id,
    propertyName: row.property_name,
    rentalType: row.rental_type,
    income,
    operatingExpenses,
    bondPayments,
    netIncome: net,
    grossYield: canonicalRatio(nullableNumber(row.gross_yield)),
    netYield: canonicalRatio(nullableNumber(row.net_yield)),
    cashOnCash: canonicalRatio(nullableNumber(row.cash_on_cash)),
    capitalGrowth: canonicalRatio(nullableNumber(row.capital_growth)),
    occupancy: canonicalRatio(nullableNumber(row.occupancy)),
    averageDailyRate: canonicalMoney(nullableNumber(row.adr)),
  };
}

function isRentalType(value: string): value is RentalType {
  return value === "long_term" || value === "short_term";
}

/** Function return types omit null, but a missing price or a long-term stay comes back as null. */
function nullableNumber(value: number | null): number | null {
  return value;
}

function canonicalMoney(value: number | string | null): string | null {
  if (value === null) {
    return null;
  }

  const text = typeof value === "number" ? value.toFixed(2) : value;
  const parsed = parseDecimal(text, SIGNED_MONEY);

  return parsed.ok ? parsed.canonical : null;
}

function canonicalRatio(value: number | string | null): string | null {
  if (value === null) {
    return null;
  }

  const text = typeof value === "number" ? value.toFixed(6) : value;
  const parsed = parseDecimal(text, RATIO);

  return parsed.ok ? parsed.canonical : null;
}
