import { centsToMoney, moneyToCents } from "@/lib/invoices/calc";
import { lastDayOfMonth } from "@/lib/invoices/period";
import { LOCALE } from "@/lib/constants";
import { MONEY, SIGNED_MONEY, parseDecimal } from "@/lib/money";

const ZERO = BigInt(0);
const TWO = BigInt(2);

/** Warn when an overridden net payout is more than R 10,00 off the calculated figure. */
export const NET_TOLERANCE_CENTS = BigInt(1000);

export type StatementAmounts = {
  grossIncome: string;
  platformFees: string;
  managementFee: string;
  cleaningFees: string;
  otherDeductions: string;
  vatOnFees: string;
};

export function canonicalUnsigned(raw: string): string | null {
  const parsed = parseDecimal(raw, MONEY);

  return parsed.ok ? parsed.canonical : null;
}

export function canonicalSigned(raw: string): string | null {
  const parsed = parseDecimal(raw, SIGNED_MONEY);

  return parsed.ok ? parsed.canonical : null;
}

export function deductionsCents(amounts: StatementAmounts): bigint | null {
  const parts = [
    amounts.platformFees,
    amounts.managementFee,
    amounts.cleaningFees,
    amounts.otherDeductions,
    amounts.vatOnFees,
  ].map(canonicalUnsigned);

  if (parts.some((part) => part === null)) {
    return null;
  }

  return parts.reduce((sum, part) => sum + moneyToCents(part ?? "0.00"), ZERO);
}

/** Gross income minus platform, management, cleaning, other deductions, and VAT on fees. */
export function calculatedNetCents(amounts: StatementAmounts): bigint | null {
  const gross = canonicalUnsigned(amounts.grossIncome);
  const deductions = deductionsCents(amounts);

  if (gross === null || deductions === null) {
    return null;
  }

  return moneyToCents(gross) - deductions;
}

export function netMismatch(entered: string, calculated: bigint): boolean {
  const net = canonicalSigned(entered);

  if (net === null) {
    return false;
  }

  const diff = moneyToCents(net) - calculated;
  const absolute = diff < ZERO ? -diff : diff;

  return absolute > NET_TOLERANCE_CENTS;
}

export function daysInPeriod(periodMonth: string): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(periodMonth);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return lastDayOfMonth(Number(match[1]), month);
}

/** nights / days in the month, shown to one decimal place. */
export function occupancyLabel(nights: number, periodMonth: string): string | null {
  const days = daysInPeriod(periodMonth);

  if (days === null || nights < 0 || nights > days) {
    return null;
  }

  const scaled = Math.floor((nights * 1000 + Math.floor(days / 2)) / days);
  const whole = Math.floor(scaled / 10);
  const tenth = scaled % 10;

  return tenth === 0 ? `${whole}%` : `${whole},${tenth}%`;
}

/** Gross income divided by nights booked. Empty when there were no nights. */
export function averageDailyRate(gross: string, nights: number): string | null {
  const canonical = canonicalUnsigned(gross);

  if (canonical === null || nights <= 0) {
    return null;
  }

  return centsToMoney(divRoundHalfAway(moneyToCents(canonical), BigInt(nights)));
}

export function trailingMonthKeys(today: string, count = 12): string[] {
  const match = /^(\d{4})-(\d{2})/.exec(today);

  if (!match?.[1] || !match[2]) {
    return [];
  }

  let year = Number(match[1]);
  let month = Number(match[2]);
  const keys: string[] = [];

  for (let index = 0; index < count; index += 1) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;

    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return keys.reverse();
}

export function formatChartMonth(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);

  if (!match?.[1] || !match[2]) {
    return yearMonth;
  }

  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export type PayoutPoint = {
  month: string;
  label: string;
  net: number;
};

export function payoutSeries(
  rows: { periodMonth: string; netPayout: string }[],
  today: string,
): PayoutPoint[] {
  const byMonth = new Map(rows.map((row) => [row.periodMonth.slice(0, 7), row.netPayout]));

  return trailingMonthKeys(today).map((month) => {
    const net = byMonth.get(month);

    return {
      month,
      label: formatChartMonth(month),
      net: net === undefined ? 0 : Number(net),
    };
  });
}

function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < ZERO;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * TWO >= denominator ? quotient + BigInt(1) : quotient;

  return negative ? -rounded : rounded;
}
