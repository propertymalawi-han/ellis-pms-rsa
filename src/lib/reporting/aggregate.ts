import { centsToMoney, moneyToCents } from "@/lib/invoices/calc";
import type { PropertyType } from "@/lib/properties/labels";
import {
  annualise,
  averageDailyRate,
  netYield,
  occupancy,
  totalInvestment,
} from "@/lib/roi";
import type { MonthlyExpenseRow, MonthlyIncomeRow, PropertyFinancialSummary } from "@/lib/reporting/queries";
import { eachMonthStart } from "@/lib/reporting/period";
import { daysInPeriod, formatChartMonth } from "@/lib/statements/calc";

/**
 * Bond interest is already represented by the bond instalment.
 * Furniture and equipment is capital, not an operating expense.
 * Names match the seeded categories and the reporting SQL.
 */
export const NON_OPERATING_EXPENSE_CATEGORIES = new Set([
  "Bond interest",
  "Furniture & equipment (capital)",
]);

export type PortfolioProperty = {
  id: string;
  name: string;
  propertyType: PropertyType;
  rentalType: "long_term" | "short_term";
  status: "active" | "sold";
  purchasePrice: string | null;
  transferCosts: string | null;
  improvementCosts: string | null;
  currentValue: string | null;
  bondAmount: string | null;
};

export type MoneyRollup = {
  amount: string | null;
  missing: number;
};

export type PortfolioFigures = {
  portfolioValue: MoneyRollup;
  totalInvestment: MoneyRollup;
  equity: MoneyRollup;
  income: string;
  expenses: string;
  netIncome: string;
  netYield: string | null;
  netYieldExcluded: number;
  longTermOccupancy: string | null;
  longTermOccupied: number;
  longTermUnits: number;
};

export type ComparisonRow = {
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  rentalType: "long_term" | "short_term";
  income: string;
  expenses: string;
  netIncome: string;
  grossYield: string | null;
  netYield: string | null;
  cashOnCash: string | null;
  capitalGrowth: string | null;
};

export type MonthFlow = {
  month: string;
  label: string;
  income: string;
  expenses: string;
  net: string;
};

export type CategoryShare = {
  categoryId: string;
  name: string;
  sortOrder: number;
  amount: string;
};

export type ExpenseBreakdown = {
  slices: CategoryShare[];
  credits: CategoryShare[];
};

export type StatementMonth = {
  propertyId: string;
  periodMonth: string;
  nightsBooked: number;
  grossIncome: string;
};

export type ShortTermMonth = {
  month: string;
  label: string;
  occupancy: string | null;
  averageDailyRate: string | null;
};

const ZERO = "0.00";

export function portfolioFigures(input: {
  properties: readonly PortfolioProperty[];
  summaries: readonly PropertyFinancialSummary[];
  occupiedPropertyIds: ReadonlySet<string>;
  periodDays: number;
}): PortfolioFigures {
  const active = input.properties.filter((property) => property.status === "active");
  const activeIds = new Set(active.map((property) => property.id));
  const summaries = input.summaries.filter((row) => activeIds.has(row.propertyId));
  const byId = new Map(summaries.map((row) => [row.propertyId, row]));

  const investments = active.map((property) =>
    totalInvestment({
      purchasePrice: property.purchasePrice,
      transferCosts: property.transferCosts,
      improvementCosts: property.improvementCosts,
    }),
  );
  const equities = active.map((property) => propertyEquity(property));

  let yieldIncome = BigInt(0);
  let yieldInvestment = BigInt(0);
  let yieldExcluded = 0;
  let yieldCount = 0;

  for (const property of active) {
    const investment = totalInvestment({
      purchasePrice: property.purchasePrice,
      transferCosts: property.transferCosts,
      improvementCosts: property.improvementCosts,
    });
    const net = byId.get(property.id)?.netIncome ?? ZERO;

    if (investment === null) {
      yieldExcluded += 1;
      continue;
    }

    yieldCount += 1;
    yieldIncome += moneyToCents(net);
    yieldInvestment += moneyToCents(investment);
  }

  const annualNet =
    yieldCount > 0 ? annualise(centsToMoney(yieldIncome), input.periodDays) : null;
  const longTerm = active.filter((property) => property.rentalType === "long_term");
  const occupied = longTerm.filter((property) => input.occupiedPropertyIds.has(property.id)).length;

  return {
    portfolioValue: rollup(active.map((property) => property.currentValue)),
    totalInvestment: rollup(investments),
    equity: rollup(equities),
    income: sumMoney(summaries.map((row) => row.income)),
    expenses: sumMoney(summaries.map((row) => row.operatingExpenses)),
    netIncome: sumMoney(summaries.map((row) => row.netIncome)),
    netYield:
      annualNet === null || yieldCount === 0
        ? null
        : netYield({
            netIncome: annualNet,
            totalInvestment: centsToMoney(yieldInvestment),
          }),
    netYieldExcluded: yieldExcluded,
    longTermOccupancy:
      longTerm.length === 0
        ? null
        : occupancy({ nightsBooked: occupied, days: longTerm.length }),
    longTermOccupied: occupied,
    longTermUnits: longTerm.length,
  };
}

export function comparisonRows(
  summaries: readonly PropertyFinancialSummary[],
  properties: readonly PortfolioProperty[],
): ComparisonRow[] {
  const active = new Map(
    properties
      .filter((property) => property.status === "active")
      .map((property) => [property.id, property]),
  );

  return summaries
    .flatMap((row) => {
      const property = active.get(row.propertyId);

      if (!property) {
        return [];
      }

      return [
        {
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          propertyType: property.propertyType,
          rentalType: row.rentalType,
          income: row.income,
          expenses: row.operatingExpenses,
          netIncome: row.netIncome,
          grossYield: row.grossYield,
          netYield: row.netYield,
          cashOnCash: row.cashOnCash,
          capitalGrowth: row.capitalGrowth,
        },
      ];
    })
    .sort((left, right) => left.propertyName.localeCompare(right.propertyName, "en-ZA"));
}

export function monthlyFlows(
  income: readonly MonthlyIncomeRow[],
  expenses: readonly MonthlyExpenseRow[],
  propertyIds: ReadonlySet<string>,
  from: string,
  to: string,
): MonthFlow[] {
  const incomeByMonth = new Map<string, bigint>();
  const expenseByMonth = new Map<string, bigint>();

  for (const row of income) {
    if (!propertyIds.has(row.propertyId) || !monthInRange(row.month, from, to)) {
      continue;
    }

    const key = row.month.slice(0, 7);
    incomeByMonth.set(key, (incomeByMonth.get(key) ?? BigInt(0)) + moneyToCents(row.income));
  }

  for (const row of expenses) {
    if (
      !propertyIds.has(row.propertyId) ||
      !monthInRange(row.month, from, to) ||
      NON_OPERATING_EXPENSE_CATEGORIES.has(row.categoryName)
    ) {
      continue;
    }

    const key = row.month.slice(0, 7);
    expenseByMonth.set(key, (expenseByMonth.get(key) ?? BigInt(0)) + moneyToCents(row.amount));
  }

  return eachMonthStart(from, to).map((monthStart) => {
    const key = monthStart.slice(0, 7);
    const incomeCents = incomeByMonth.get(key) ?? BigInt(0);
    const expenseCents = expenseByMonth.get(key) ?? BigInt(0);

    return {
      month: key,
      label: formatChartMonth(key),
      income: centsToMoney(incomeCents),
      expenses: centsToMoney(expenseCents),
      net: centsToMoney(incomeCents - expenseCents),
    };
  });
}

export function expenseBreakdown(
  expenses: readonly MonthlyExpenseRow[],
  propertyIds: ReadonlySet<string>,
  from: string,
  to: string,
): ExpenseBreakdown {
  const totals = new Map<string, CategoryShare & { cents: bigint }>();

  for (const row of expenses) {
    if (
      !propertyIds.has(row.propertyId) ||
      !monthInRange(row.month, from, to) ||
      NON_OPERATING_EXPENSE_CATEGORIES.has(row.categoryName)
    ) {
      continue;
    }

    const current = totals.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      name: row.categoryName,
      sortOrder: row.sortOrder,
      amount: ZERO,
      cents: BigInt(0),
    };
    current.cents += moneyToCents(row.amount);
    totals.set(row.categoryId, current);
  }

  const shares = [...totals.values()]
    .map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      sortOrder: row.sortOrder,
      amount: centsToMoney(row.cents),
    }))
    .filter((row) => row.amount !== ZERO)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "en-ZA"));

  return {
    slices: shares.filter((row) => moneyToCents(row.amount) > BigInt(0)),
    credits: shares.filter((row) => moneyToCents(row.amount) < BigInt(0)),
  };
}

/**
 * Occupancy for a month is nights booked divided by the days in that month
 * times the number of active short-term properties. A property with no
 * statement contributes no nights. ADR is gross income divided by nights booked.
 */
export function shortTermMonths(
  statements: readonly StatementMonth[],
  propertyIds: readonly string[],
  from: string,
  to: string,
): ShortTermMonth[] {
  if (propertyIds.length === 0) {
    return [];
  }

  const included = new Set(propertyIds);
  const byMonth = new Map<string, { nights: number; gross: bigint }>();

  for (const row of statements) {
    if (!included.has(row.propertyId) || !monthInRange(row.periodMonth, from, to)) {
      continue;
    }

    const key = row.periodMonth.slice(0, 7);
    const current = byMonth.get(key) ?? { nights: 0, gross: BigInt(0) };
    current.nights += row.nightsBooked;
    current.gross += moneyToCents(row.grossIncome);
    byMonth.set(key, current);
  }

  return eachMonthStart(from, to).map((monthStart) => {
    const key = monthStart.slice(0, 7);
    const daysEach = daysInPeriod(key);
    const bucket = byMonth.get(key);
    const nights = bucket?.nights ?? 0;
    const days = daysEach === null ? 0 : daysEach * propertyIds.length;

    return {
      month: key,
      label: formatChartMonth(key),
      occupancy: days > 0 ? occupancy({ nightsBooked: nights, days }) : null,
      averageDailyRate:
        bucket && nights > 0
          ? averageDailyRate({
              grossIncome: centsToMoney(bucket.gross),
              nightsBooked: nights,
            })
          : null,
    };
  });
}

export function propertyEquity(property: Pick<PortfolioProperty, "currentValue" | "bondAmount">): string | null {
  if (property.currentValue === null) {
    return null;
  }

  const bond = property.bondAmount === null ? BigInt(0) : moneyToCents(property.bondAmount);

  return centsToMoney(moneyToCents(property.currentValue) - bond);
}

function rollup(values: readonly (string | null)[]): MoneyRollup {
  let total = BigInt(0);
  let present = 0;
  let missing = 0;

  for (const value of values) {
    if (value === null) {
      missing += 1;
      continue;
    }

    present += 1;
    total += moneyToCents(value);
  }

  return {
    amount: present === 0 ? null : centsToMoney(total),
    missing,
  };
}

function sumMoney(amounts: readonly string[]): string {
  let total = BigInt(0);

  for (const amount of amounts) {
    total += moneyToCents(amount);
  }

  return centsToMoney(total);
}

function monthInRange(month: string, from: string, to: string): boolean {
  const key = month.slice(0, 7);

  return key >= from.slice(0, 7) && key <= to.slice(0, 7);
}
