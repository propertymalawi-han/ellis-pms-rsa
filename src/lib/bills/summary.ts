import { effectiveStatus } from "@/lib/expenses/calc";
import { taxYearForIso } from "@/lib/format";
import { centsToMoney, moneyToCents } from "@/lib/invoices/calc";
import { formatMonthLabel } from "@/lib/invoices/period";
import { formatChartMonth, trailingMonthKeys } from "@/lib/statements/calc";
import type { BillStatus } from "@/lib/bills/labels";
import type { BillProperty, RatesBill } from "@/lib/bills/types";

const ZERO = BigInt(0);
const TWO = BigInt(2);
const THOUSAND = BigInt(1000);
const CHART_MONTHS = 24;

/**
 * Monthly cost is levy, special levy, municipal rates and utilities.
 * Arrears are a balance brought forward, so they stay on the bill total and
 * out of the chart, the average and the year-to-date figure.
 */
export type ChargePoint = {
  month: string;
  label: string;
  levy: number;
  rates: number;
  utilities: number;
  total: number;
};

export type PropertyBillSummary = {
  currentMonthLabel: string;
  currentMonthTotal: string | null;
  outstanding: string;
  paidThisTaxYear: string;
  averageMonthlyCost: string | null;
  yearOnYear: string | null;
  comparisonLabel: string | null;
  missingMonths: string[];
};

export type PortfolioStatus = BillStatus | "missing";

export type PortfolioProperty = {
  propertyId: string;
  propertyName: string;
  monthTotal: string | null;
  status: PortfolioStatus;
  outstanding: string;
  yearToDate: string;
};

export type PortfolioTotals = {
  monthTotal: string;
  outstanding: string;
  yearToDate: string;
};

type ChargeParts = {
  levy: bigint;
  rates: bigint;
  utilities: bigint;
};

export function utilitiesCents(
  bill: Pick<
    RatesBill,
    "water" | "electricity" | "refuse" | "sewerage" | "otherCharges" | "interest"
  >,
): bigint {
  return (
    moneyToCents(bill.water) +
    moneyToCents(bill.electricity) +
    moneyToCents(bill.refuse) +
    moneyToCents(bill.sewerage) +
    moneyToCents(bill.otherCharges) +
    moneyToCents(bill.interest)
  );
}

export function chargesCents(bill: RatesBill): bigint {
  return (
    moneyToCents(bill.levy) +
    moneyToCents(bill.specialLevy) +
    moneyToCents(bill.municipalRates) +
    utilitiesCents(bill)
  );
}

export function propertyBillSummary(bills: RatesBill[], today: string): PropertyBillSummary {
  const currentKey = today.slice(0, 7);
  const previousKey = shiftYear(currentKey, -1);
  const taxYear = taxYearForIso(today);
  let currentTotal = ZERO;
  let currentCharges = ZERO;
  let currentCount = 0;
  let previousCharges = ZERO;
  let previousCount = 0;
  let outstanding = ZERO;
  let paid = ZERO;
  const chargesByMonth = new Map<string, bigint>();
  const uploadedMonths = new Set<string>();
  let earliest: string | null = null;

  for (const bill of bills) {
    const month = bill.periodMonth.slice(0, 7);
    const charges = chargesCents(bill);
    chargesByMonth.set(month, (chargesByMonth.get(month) ?? ZERO) + charges);

    if (bill.filePath) {
      uploadedMonths.add(month);
    }

    if (earliest === null || month < earliest) {
      earliest = month;
    }

    if (month === currentKey) {
      currentTotal += moneyToCents(bill.totalDue);
      currentCharges += charges;
      currentCount += 1;
    }

    if (previousKey && month === previousKey) {
      previousCharges += charges;
      previousCount += 1;
    }

    const status = effectiveStatus(bill, today);

    if (status === "due" || status === "overdue") {
      outstanding += moneyToCents(bill.totalDue);
    }

    if (
      bill.paidDate &&
      bill.amountPaid &&
      taxYear &&
      taxYearForIso(bill.paidDate) === taxYear
    ) {
      paid += moneyToCents(bill.amountPaid);
    }
  }

  let average: bigint | null = null;
  let billedMonths = 0;
  let chargeSum = ZERO;

  if (taxYear) {
    for (const [month, cents] of chargesByMonth) {
      if (taxYearForIso(`${month}-01`) === taxYear && month <= currentKey) {
        billedMonths += 1;
        chargeSum += cents;
      }
    }
  }

  if (billedMonths > 0) {
    average = divRoundHalfAway(chargeSum, BigInt(billedMonths));
  }

  const tenths =
    currentCount > 0 && previousCount > 0
      ? changeTenths(currentCharges, previousCharges)
      : null;

  const windowStart = earliest !== null && earliest < currentKey ? earliest : currentKey;
  const missingMonths =
    bills.length === 0
      ? []
      : trailingMonthKeys(today, CHART_MONTHS)
          .filter((month) => month >= windowStart && !uploadedMonths.has(month))
          .reverse();

  return {
    currentMonthLabel: formatMonthLabel(currentKey),
    currentMonthTotal: currentCount > 0 ? centsToMoney(currentTotal) : null,
    outstanding: centsToMoney(outstanding),
    paidThisTaxYear: centsToMoney(paid),
    averageMonthlyCost: average === null ? null : centsToMoney(average),
    yearOnYear: tenths === null ? null : formatTenthsPercent(tenths),
    comparisonLabel: previousKey ? formatMonthLabel(previousKey) : null,
    missingMonths,
  };
}

/** Last 24 months, oldest first. Levy includes the special levy. Recharts needs numbers, so cents are converted only here. */
export function chargeSeries(bills: RatesBill[], today: string): ChargePoint[] {
  const sums = new Map<string, ChargeParts>();

  for (const bill of bills) {
    const month = bill.periodMonth.slice(0, 7);
    const current = sums.get(month) ?? { levy: ZERO, rates: ZERO, utilities: ZERO };
    current.levy += moneyToCents(bill.levy) + moneyToCents(bill.specialLevy);
    current.rates += moneyToCents(bill.municipalRates);
    current.utilities += utilitiesCents(bill);
    sums.set(month, current);
  }

  return trailingMonthKeys(today, CHART_MONTHS).map((month) => {
    const row = sums.get(month) ?? { levy: ZERO, rates: ZERO, utilities: ZERO };
    const total = row.levy + row.rates + row.utilities;

    return {
      month,
      label: formatChartMonth(month),
      levy: Number(centsToMoney(row.levy)),
      rates: Number(centsToMoney(row.rates)),
      utilities: Number(centsToMoney(row.utilities)),
      total: Number(centsToMoney(total)),
    };
  });
}

export function portfolioProperties(
  bills: RatesBill[],
  properties: BillProperty[],
  today: string,
): PortfolioProperty[] {
  const currentKey = today.slice(0, 7);
  const taxYear = taxYearForIso(today);
  const byProperty = new Map<string, RatesBill[]>();

  for (const bill of bills) {
    const list = byProperty.get(bill.propertyId) ?? [];
    list.push(bill);
    byProperty.set(bill.propertyId, list);
  }

  return properties
    .map((property) => {
      const rows = byProperty.get(property.id) ?? [];
      let monthTotal = ZERO;
      let monthCount = 0;
      let outstanding = ZERO;
      let yearToDate = ZERO;
      let hasOverdue = false;
      let hasDue = false;

      for (const bill of rows) {
        const month = bill.periodMonth.slice(0, 7);
        const status = effectiveStatus(bill, today);

        if (month === currentKey) {
          monthTotal += moneyToCents(bill.totalDue);
          monthCount += 1;
        }

        if (status === "overdue") {
          hasOverdue = true;
        } else if (status === "due") {
          hasDue = true;
        }

        if (status === "due" || status === "overdue") {
          outstanding += moneyToCents(bill.totalDue);
        }

        if (taxYear && taxYearForIso(bill.periodMonth) === taxYear && month <= currentKey) {
          yearToDate += chargesCents(bill);
        }
      }

      let status: PortfolioStatus = "paid";

      if (hasOverdue) {
        status = "overdue";
      } else if (hasDue) {
        status = "due";
      } else if (monthCount === 0) {
        status = "missing";
      }

      return {
        propertyId: property.id,
        propertyName: property.name,
        monthTotal: monthCount > 0 ? centsToMoney(monthTotal) : null,
        status,
        outstanding: centsToMoney(outstanding),
        yearToDate: centsToMoney(yearToDate),
      };
    })
    .sort((left, right) => left.propertyName.localeCompare(right.propertyName, "en-ZA"));
}

export function portfolioTotals(rows: PortfolioProperty[]): PortfolioTotals {
  let monthTotal = ZERO;
  let outstanding = ZERO;
  let yearToDate = ZERO;

  for (const row of rows) {
    if (row.monthTotal) {
      monthTotal += moneyToCents(row.monthTotal);
    }

    outstanding += moneyToCents(row.outstanding);
    yearToDate += moneyToCents(row.yearToDate);
  }

  return {
    monthTotal: centsToMoney(monthTotal),
    outstanding: centsToMoney(outstanding),
    yearToDate: centsToMoney(yearToDate),
  };
}

function shiftYear(yearMonth: string, delta: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return `${Number(match[1]) + delta}-${match[2]}`;
}

/** Change in tenths of a percent. Null when last year was zero and this year is not. */
function changeTenths(current: bigint, previous: bigint): bigint | null {
  if (previous === ZERO) {
    return current === ZERO ? ZERO : null;
  }

  const delta = current - previous;
  const negative = delta < ZERO;
  const absolute = negative ? -delta : delta;
  const scaled = absolute * THOUSAND;
  const quotient = scaled / previous;
  const remainder = scaled % previous;
  const rounded = remainder * TWO >= previous ? quotient + BigInt(1) : quotient;

  return negative ? -rounded : rounded;
}

function formatTenthsPercent(tenths: bigint): string {
  const negative = tenths < ZERO;
  const absolute = negative ? -tenths : tenths;
  const whole = (absolute / BigInt(10)).toString();
  const tenth = (absolute % BigInt(10)).toString();
  const body = `${whole},${tenth}%`;

  if (negative) {
    return `-${body}`;
  }

  if (tenths > ZERO) {
    return `+${body}`;
  }

  return body;
}

function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < ZERO;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * TWO >= denominator ? quotient + BigInt(1) : quotient;

  return negative ? -rounded : rounded;
}
