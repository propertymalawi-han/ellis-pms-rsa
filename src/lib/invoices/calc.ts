import { MONEY, parseDecimal, type DecimalSpec } from "@/lib/money";

/** numeric(12,2), capped at 999 999,99. */
export const QUANTITY: DecimalSpec = {
  scale: 2,
  maxIntegerDigits: 6,
  max: BigInt("99999999"),
};

const ZERO = BigInt(0);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

export const VAT_PERCENT = BigInt(15);

export function moneyToCents(canonical: string): bigint {
  const negative = canonical.startsWith("-");
  const [integer = "0", fraction = ""] = canonical.replace("-", "").split(".");
  const cents =
    BigInt(integer || "0") * HUNDRED + BigInt(fraction.padEnd(2, "0").slice(0, 2));

  return negative ? -cents : cents;
}

export function centsToMoney(cents: bigint): string {
  const negative = cents < ZERO;
  const absolute = negative ? -cents : cents;
  const fraction = (absolute % HUNDRED).toString().padStart(2, "0");

  return `${negative ? "-" : ""}${absolute / HUNDRED}.${fraction}`;
}

function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < ZERO;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * TWO >= denominator ? quotient + BigInt(1) : quotient;

  return negative ? -rounded : rounded;
}

/** quantity and unit price are canonical 2-decimal strings. Matches Postgres round(quantity * unit_price, 2). */
export function lineTotalCents(quantity: string, unitPrice: string): bigint {
  return divRoundHalfAway(moneyToCents(quantity) * moneyToCents(unitPrice), HUNDRED);
}

/** 15% of a line, rounded half away from zero to the cent. Zero when VAT does not apply. */
export function vatCents(lineTotal: bigint, vatApplicable: boolean): bigint {
  if (!vatApplicable || lineTotal === ZERO) {
    return ZERO;
  }

  return divRoundHalfAway(lineTotal * VAT_PERCENT, HUNDRED);
}

export type PricedLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  vatApplicable: boolean;
  lineTotal: string;
  vatAmount: string;
};

export function priceCanonicalLines(
  lines: {
    description: string;
    quantity: string;
    unitPrice: string;
    vatApplicable: boolean;
  }[],
): { lines: PricedLine[]; subtotal: string; vatAmount: string; total: string } {
  let subtotal = ZERO;
  let vatAmount = ZERO;

  const priced = lines.map((line) => {
    const total = lineTotalCents(line.quantity, line.unitPrice);
    const vat = vatCents(total, line.vatApplicable);
    subtotal += total;
    vatAmount += vat;

    return {
      ...line,
      lineTotal: centsToMoney(total),
      vatAmount: centsToMoney(vat),
    };
  });

  return {
    lines: priced,
    subtotal: centsToMoney(subtotal),
    vatAmount: centsToMoney(vatAmount),
    total: centsToMoney(subtotal + vatAmount),
  };
}

export function canonicalMoney(raw: string): string | null {
  const parsed = parseDecimal(raw, MONEY);

  return parsed.ok ? parsed.canonical : null;
}

export function canonicalQuantity(raw: string): string | null {
  const parsed = parseDecimal(raw, QUANTITY);

  if (!parsed.ok || parsed.canonical === "0.00") {
    return null;
  }

  return parsed.canonical;
}

export function balanceCents(total: string, amountPaid: string): bigint {
  const balance = moneyToCents(total) - moneyToCents(amountPaid);

  return balance > ZERO ? balance : ZERO;
}
