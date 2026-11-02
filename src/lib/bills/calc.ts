import { centsToMoney, moneyToCents, canonicalMoney } from "@/lib/invoices/calc";
import { TOTAL_TOLERANCE_CENTS, type BillType } from "@/lib/bills/labels";

export { canonicalMoney };

export const lineItemFields = [
  "levy",
  "specialLevy",
  "municipalRates",
  "water",
  "electricity",
  "refuse",
  "sewerage",
  "otherCharges",
  "arrears",
  "interest",
] as const;

export type LineItemField = (typeof lineItemFields)[number];

export type LineItemValues = Record<LineItemField, string>;

/** Blank lines count as zero. An invalid amount makes the sum unavailable. */
export function lineItemsCents(values: LineItemValues): bigint | null {
  let sum = BigInt(0);

  for (const field of lineItemFields) {
    const raw = values[field].trim();

    if (raw === "") {
      continue;
    }

    const canonical = canonicalMoney(raw);

    if (!canonical) {
      return null;
    }

    sum += moneyToCents(canonical);
  }

  return sum;
}

export function totalDueMismatch(totalDue: string, lineCents: bigint): boolean {
  const total = canonicalMoney(totalDue);

  if (!total) {
    return false;
  }

  const diff = moneyToCents(total) - lineCents;
  const absolute = diff < BigInt(0) ? -diff : diff;

  return absolute > TOTAL_TOLERANCE_CENTS;
}

export function moneyOrZero(raw: string): string | null {
  if (raw.trim() === "") {
    return "0.00";
  }

  return canonicalMoney(raw);
}

export function formatLineTotal(cents: bigint): string {
  return centsToMoney(cents);
}

/**
 * Issuer and account come from the property where it has them, and from the
 * previous bill of the same type for the name or number the property does not store.
 */
export function prefillIssuerAndAccount(
  billType: BillType,
  property: {
    bodyCorporateName: string | null;
    municipalAccountNumber: string | null;
  },
  previous: { issuerName: string | null; accountNumber: string | null } | null,
): { issuerName: string; accountNumber: string } {
  const body = property.bodyCorporateName?.trim() ?? "";
  const municipalAccount = property.municipalAccountNumber?.trim() ?? "";
  const previousIssuer = previous?.issuerName?.trim() ?? "";
  const previousAccount = previous?.accountNumber?.trim() ?? "";

  if (billType === "levy") {
    return {
      issuerName: body || previousIssuer,
      accountNumber: previousAccount,
    };
  }

  if (billType === "municipal") {
    return {
      issuerName: previousIssuer,
      accountNumber: municipalAccount || previousAccount,
    };
  }

  return {
    issuerName: previousIssuer || body,
    accountNumber: municipalAccount || previousAccount,
  };
}
