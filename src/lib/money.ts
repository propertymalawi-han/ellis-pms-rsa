/**
 * Money and rates stay as exact decimal strings until they are written.
 * Postgres `numeric` values are sent as decimal strings so the app does not
 * round through binary floats. Validation uses integer units (cents, or
 * thousandths of a percent), not `number`.
 */

export type DecimalSpec = {
  scale: number;
  maxIntegerDigits: number;
  /** Inclusive maximum of the absolute value, in units of 10^-scale. */
  max?: bigint;
  allowNegative?: boolean;
};

export type DecimalParseResult =
  | { ok: true; canonical: string }
  | { ok: false; message: string };

/** numeric(14,2): up to 999 999 999 999,99 */
export const MONEY: DecimalSpec = {
  scale: 2,
  maxIntegerDigits: 12,
  max: BigInt("99999999999999"),
};

/** numeric(14,2) that may be negative, used for an overridden net payout. */
export const SIGNED_MONEY: DecimalSpec = {
  scale: 2,
  maxIntegerDigits: 12,
  max: BigInt("99999999999999"),
  allowNegative: true,
};

/** numeric(6,3), and the column check caps the rate at 100. */
export const INTEREST_RATE: DecimalSpec = {
  scale: 3,
  maxIntegerDigits: 3,
  max: BigInt("100000"),
};

/** numeric(5,2), capped at 100. Units are hundredths of a percent. */
export const PERCENT: DecimalSpec = {
  scale: 2,
  maxIntegerDigits: 3,
  max: BigInt("10000"),
};

export function parseDecimal(raw: string, spec: DecimalSpec): DecimalParseResult {
  let input = raw.trim().replace(/[\s\u00a0]/g, "");
  input = input.replace(/^(?:ZAR|R)/i, "");

  if (input.startsWith("+")) {
    input = input.slice(1);
  }

  let negative = false;

  if (input.startsWith("-")) {
    if (!spec.allowNegative) {
      return { ok: false, message: "Enter a number of 0 or more." };
    }

    negative = true;
    input = input.slice(1);
  }

  if (input === "") {
    return { ok: false, message: "Enter a number." };
  }

  const normalized = normalizeDecimal(input, spec.scale);

  if (!normalized.ok) {
    return normalized;
  }

  const [integerPartRaw, fractionPartRaw = ""] = normalized.value.split(".");

  if (!/^\d+$/.test(integerPartRaw) || !/^\d*$/.test(fractionPartRaw)) {
    return { ok: false, message: "Enter a valid number." };
  }

  if (fractionPartRaw.length > spec.scale) {
    return {
      ok: false,
      message:
        spec.scale === 0
          ? "Enter a whole number."
          : `Use at most ${spec.scale} decimal places.`,
    };
  }

  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "");

  if (integerPart.length > spec.maxIntegerDigits) {
    return { ok: false, message: "That number is too large." };
  }

  const units = BigInt(
    `${integerPart}${fractionPartRaw.padEnd(spec.scale, "0")}` || "0",
  );

  if (spec.max !== undefined && units > spec.max) {
    return { ok: false, message: "That number is too large." };
  }

  const canonical =
    spec.scale === 0
      ? integerPart
      : `${integerPart}.${fractionPartRaw.padEnd(spec.scale, "0")}`;

  return {
    ok: true,
    canonical: negative && units !== BigInt(0) ? `-${canonical}` : canonical,
  };
}

/** "1234.50" -> "1 234,50", dropping trailing zeros in the fraction. */
export function decimalToInput(canonical: string): string {
  const negative = canonical.startsWith("-");
  const unsigned = negative ? canonical.slice(1) : canonical;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const formatted =
    trimmedFraction.length > 0 ? `${grouped},${trimmedFraction}` : grouped;

  return negative ? `-${formatted}` : formatted;
}

export function numberToDecimalInput(
  value: number | null,
  spec: DecimalSpec,
): string {
  if (value === null) {
    return "";
  }

  const parsed = parseDecimal(value.toFixed(spec.scale), spec);

  if (!parsed.ok) {
    return "";
  }

  return decimalToInput(parsed.canonical);
}

/**
 * PostgREST accepts `numeric` as a JSON string. The cast keeps that string
 * at runtime; the generated client types the column as `number`.
 */
export function decimalColumn(raw: string, spec: DecimalSpec): number | null {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return null;
  }

  const parsed = parseDecimal(trimmed, spec);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.canonical as unknown as number;
}

function normalizeDecimal(
  input: string,
  scale: number,
): { ok: true; value: string } | { ok: false; message: string } {
  const commaCount = countChar(input, ",");
  const dotCount = countChar(input, ".");

  if (commaCount === 0 && dotCount === 0) {
    return { ok: true, value: input };
  }

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = input.lastIndexOf(",");
    const lastDot = input.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    const decimalAt = Math.max(lastComma, lastDot);
    const integerRaw = input.slice(0, decimalAt);
    const fractionRaw = input.slice(decimalAt + 1);

    if (!isGrouped(integerRaw, thousandSep) || !/^\d+$/.test(fractionRaw)) {
      return { ok: false, message: "Enter a valid number." };
    }

    return {
      ok: true,
      value: `${integerRaw.split(thousandSep).join("")}.${fractionRaw}`,
    };
  }

  const separator = commaCount > 0 ? "," : ".";
  const parts = input.split(separator);
  const fractionCandidate = parts.at(-1) ?? "";
  const looksLikeDecimal =
    parts.length === 2 &&
    fractionCandidate.length > 0 &&
    fractionCandidate.length <= scale &&
    /^\d+$/.test(parts[0] ?? "") &&
    /^\d+$/.test(fractionCandidate);

  if (looksLikeDecimal) {
    return { ok: true, value: `${parts[0]}.${fractionCandidate}` };
  }

  if (isGrouped(input, separator)) {
    return { ok: true, value: input.split(separator).join("") };
  }

  return { ok: false, message: "Enter a valid number." };
}

function isGrouped(value: string, separator: string): boolean {
  const parts = value.split(separator);

  if (parts.length === 1) {
    return /^\d+$/.test(value);
  }

  if (!/^\d{1,3}$/.test(parts[0] ?? "")) {
    return false;
  }

  return parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}
