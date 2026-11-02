import { centsToMoney, moneyToCents } from "@/lib/invoices/calc";
import { SIGNED_MONEY, parseDecimal } from "@/lib/money";

/**
 * ROI formulas from PROJECT_SPEC.md. Money stays in integer cents.
 * Ratios are decimal strings with 6 places (0.120000 is 12%).
 * A full year is 365 or 366 days and is not rescaled. Any other length is a
 * run-rate: amount * 365 / days, rounded half away from zero to the cent.
 * That matches Postgres `round(numeric, scale)`.
 */

const ZERO = BigInt(0);
const YEAR_DAYS = BigInt(365);
const RATIO_SCALE = BigInt(1_000_000);
const FULL_YEAR_DAYS = new Set([365, 366]);

export type RentalType = "long_term" | "short_term";

export type InvestmentInput = {
  purchasePrice: string | null;
  transferCosts?: string | null;
  improvementCosts?: string | null;
};

export type PeriodSummaryInput = {
  rentalType: RentalType;
  income: string;
  operatingExpenses: string;
  bondMonthlyPayment: string | null;
  purchasePrice: string | null;
  transferCosts?: string | null;
  improvementCosts?: string | null;
  bondAmount: string | null;
  currentValue: string | null;
  periodDays: number;
  nightsBooked: number | null;
  daysAvailable: number | null;
  grossIncome: string | null;
};

export type PeriodSummary = {
  income: string;
  operatingExpenses: string;
  bondPayments: string;
  netIncome: string;
  grossYield: string | null;
  netYield: string | null;
  cashOnCash: string | null;
  capitalGrowth: string | null;
  occupancy: string | null;
  averageDailyRate: string | null;
};

/** purchase_price + transfer_costs + improvement_costs. Null when the purchase price is unknown. */
export function totalInvestment(input: InvestmentInput): string | null {
  const purchase = readMoney(input.purchasePrice, "missing");
  const transfer = readMoney(input.transferCosts, "zero");
  const improvements = readMoney(input.improvementCosts, "zero");

  if (purchase === null || transfer === null || improvements === null) {
    return null;
  }

  if (purchase < ZERO || transfer < ZERO || improvements < ZERO) {
    return null;
  }

  return centsToMoney(purchase + transfer + improvements);
}

/** Annual rental income / purchase price. Null when the purchase price is missing or zero. */
export function grossYield(input: {
  annualIncome: string;
  purchasePrice: string | null;
}): string | null {
  const income = readMoney(input.annualIncome, "zero");
  const price = readMoney(input.purchasePrice, "missing");

  if (income === null || price === null || price <= ZERO) {
    return null;
  }

  return ratio(income, price);
}

/** Annual income minus annual operating expenses. Bond capital is not an operating expense. */
export function netIncome(input: {
  annualIncome: string;
  annualOperatingExpenses: string;
}): string | null {
  const income = readMoney(input.annualIncome, "zero");
  const expenses = readMoney(input.annualOperatingExpenses, "zero");

  if (income === null || expenses === null) {
    return null;
  }

  return centsToMoney(income - expenses);
}

/** Net income / total investment. Null when the investment is missing or zero. */
export function netYield(input: {
  netIncome: string;
  totalInvestment: string | null;
}): string | null {
  const net = readMoney(input.netIncome, "zero");
  const investment = readMoney(input.totalInvestment, "missing");

  if (net === null || investment === null || investment <= ZERO) {
    return null;
  }

  return ratio(net, investment);
}

/**
 * Total investment minus the bond. No bond (null or zero) leaves the full
 * investment as cash. Null when the result is zero or negative, or the
 * investment is unknown.
 */
export function cashInvested(input: {
  totalInvestment: string | null;
  bondAmount: string | null;
}): string | null {
  const investment = readMoney(input.totalInvestment, "missing");
  const bond = readMoney(input.bondAmount, "zero");

  if (investment === null || bond === null || investment < ZERO || bond < ZERO) {
    return null;
  }

  if (bond === ZERO) {
    return centsToMoney(investment);
  }

  const cash = investment - bond;

  if (cash <= ZERO) {
    return null;
  }

  return centsToMoney(cash);
}

/**
 * (Net income - annual bond payments) / cash invested.
 * A missing bond payment is zero. Null when there is no positive cash invested.
 */
export function cashOnCash(input: {
  netIncome: string;
  annualBondPayments: string | null;
  cashInvested: string | null;
}): string | null {
  const net = readMoney(input.netIncome, "zero");
  const bondPayments = readMoney(input.annualBondPayments, "zero");
  const cash = readMoney(input.cashInvested, "missing");

  if (net === null || bondPayments === null || cash === null || cash <= ZERO) {
    return null;
  }

  return ratio(net - bondPayments, cash);
}

/** (current_value - purchase_price) / purchase_price. Null when either figure is missing or the price is zero. */
export function capitalGrowth(input: {
  currentValue: string | null;
  purchasePrice: string | null;
}): string | null {
  const value = readMoney(input.currentValue, "missing");
  const price = readMoney(input.purchasePrice, "missing");

  if (value === null || price === null || value < ZERO || price <= ZERO) {
    return null;
  }

  return ratio(value - price, price);
}

/** Nights booked / days available. Null when the day count is not positive. */
export function occupancy(input: { nightsBooked: number; days: number }): string | null {
  if (!Number.isInteger(input.nightsBooked) || !Number.isInteger(input.days)) {
    return null;
  }

  if (input.nightsBooked < 0 || input.days <= 0) {
    return null;
  }

  return ratio(BigInt(input.nightsBooked), BigInt(input.days));
}

/** Gross income / nights booked. Null when no nights were booked. */
export function averageDailyRate(input: {
  grossIncome: string;
  nightsBooked: number;
}): string | null {
  if (!Number.isInteger(input.nightsBooked) || input.nightsBooked <= 0) {
    return null;
  }

  const gross = readMoney(input.grossIncome, "zero");

  if (gross === null) {
    return null;
  }

  return centsToMoney(divRoundHalfAway(gross, BigInt(input.nightsBooked)));
}

/** Scale a period amount to a 365-day year. A 365- or 366-day period is already annual. */
export function annualise(amount: string, periodDays: number): string | null {
  const value = readMoney(amount, "zero");

  if (value === null || !isDayCount(periodDays)) {
    return null;
  }

  if (FULL_YEAR_DAYS.has(periodDays)) {
    return centsToMoney(value);
  }

  return centsToMoney(divRoundHalfAway(value * YEAR_DAYS, BigInt(periodDays)));
}

/** Contractual instalment times 12. A missing instalment is zero. */
export function annualBondPayments(monthlyPayment: string | null): string | null {
  const monthly = readMoney(monthlyPayment, "zero");

  if (monthly === null || monthly < ZERO) {
    return null;
  }

  return centsToMoney(monthly * BigInt(12));
}

/** The year's bond instalments attributed to this period. A full year is 12 instalments. */
export function periodBondPayments(
  monthlyPayment: string | null,
  periodDays: number,
): string | null {
  const annual = annualBondPayments(monthlyPayment);

  if (annual === null || !isDayCount(periodDays)) {
    return null;
  }

  if (FULL_YEAR_DAYS.has(periodDays)) {
    return annual;
  }

  return centsToMoney(
    divRoundHalfAway(moneyToCents(annual) * BigInt(periodDays), YEAR_DAYS),
  );
}

/**
 * Period totals plus the annual yields.
 * Income, expenses, bond payments and net income are the selected period.
 * Yields annualise those flows. Capital growth does not depend on the period.
 * Occupancy and ADR are only set for short-term rentals.
 */
export function summarisePeriod(input: PeriodSummaryInput): PeriodSummary | null {
  const income = readMoney(input.income, "zero");
  const operating = readMoney(input.operatingExpenses, "zero");

  if (income === null || operating === null || !isDayCount(input.periodDays)) {
    return null;
  }

  const incomeText = centsToMoney(income);
  const operatingText = centsToMoney(operating);
  const annualIncome = annualise(incomeText, input.periodDays);
  const annualOperating = annualise(operatingText, input.periodDays);
  const bondPayments = periodBondPayments(input.bondMonthlyPayment, input.periodDays);
  const annualBond = annualBondPayments(input.bondMonthlyPayment);
  const periodNet = netIncome({
    annualIncome: incomeText,
    annualOperatingExpenses: operatingText,
  });
  const investment = totalInvestment(input);

  if (
    annualIncome === null ||
    annualOperating === null ||
    bondPayments === null ||
    annualBond === null ||
    periodNet === null
  ) {
    return null;
  }

  const annualNet = netIncome({
    annualIncome,
    annualOperatingExpenses: annualOperating,
  });

  if (annualNet === null) {
    return null;
  }

  const cash = cashInvested({
    totalInvestment: investment,
    bondAmount: input.bondAmount,
  });
  const shortTerm = input.rentalType === "short_term";

  return {
    income: incomeText,
    operatingExpenses: operatingText,
    bondPayments,
    netIncome: periodNet,
    grossYield: grossYield({
      annualIncome,
      purchasePrice: input.purchasePrice,
    }),
    netYield: netYield({
      netIncome: annualNet,
      totalInvestment: investment,
    }),
    cashOnCash: cashOnCash({
      netIncome: annualNet,
      annualBondPayments: annualBond,
      cashInvested: cash,
    }),
    capitalGrowth: capitalGrowth({
      currentValue: input.currentValue,
      purchasePrice: input.purchasePrice,
    }),
    occupancy:
      shortTerm && input.nightsBooked !== null && input.daysAvailable !== null
        ? occupancy({
            nightsBooked: input.nightsBooked,
            days: input.daysAvailable,
          })
        : null,
    averageDailyRate:
      shortTerm && input.grossIncome !== null && input.nightsBooked !== null
        ? averageDailyRate({
            grossIncome: input.grossIncome,
            nightsBooked: input.nightsBooked,
          })
        : null,
  };
}

function isDayCount(days: number): boolean {
  return Number.isInteger(days) && days > 0;
}

function readMoney(
  value: string | null | undefined,
  blank: "zero" | "missing",
): bigint | null {
  if (value === null || value === undefined || value.trim() === "") {
    return blank === "zero" ? ZERO : null;
  }

  const parsed = parseDecimal(value, SIGNED_MONEY);

  if (!parsed.ok) {
    return null;
  }

  return moneyToCents(parsed.canonical);
}

function ratio(numerator: bigint, denominator: bigint): string | null {
  if (denominator === ZERO) {
    return null;
  }

  return formatRatio(divRoundHalfAway(numerator * RATIO_SCALE, denominator));
}

function formatRatio(scaled: bigint): string {
  const negative = scaled < ZERO;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / RATIO_SCALE;
  const fraction = (absolute % RATIO_SCALE).toString().padStart(6, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Matches Postgres `round` for numeric: half away from zero. Denominator must be positive. */
function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator < ZERO) {
    return -divRoundHalfAway(numerator, -denominator);
  }

  const negative = numerator < ZERO;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded =
    remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;

  return negative ? -rounded : rounded;
}
