import { centsToMoney } from "@/lib/invoices/calc";
import { formatMonthLabel } from "@/lib/invoices/period";
import { getActor } from "@/lib/auth/access";
import { deductionsCents } from "@/lib/statements/calc";
import { isStatementStatus } from "@/lib/statements/labels";
import { MONEY, SIGNED_MONEY, parseDecimal } from "@/lib/money";
import type { IncomeEntry, IncomeProperty } from "@/lib/income/types";

export type { IncomeEntry, IncomeProperty };

export async function listIncome(): Promise<
  { ok: true; entries: IncomeEntry[]; properties: IncomeProperty[] } | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const [propertiesResult, paymentsResult, statementsResult] = await Promise.all([
    actor.supabase.from("properties_basic").select("id, name, rental_type").order("name"),
    actor.supabase
      .from("payments")
      .select("id, amount, payment_date, invoices!inner(property_id, invoice_number)")
      .order("payment_date", { ascending: false }),
    actor.supabase
      .from("owner_statements")
      .select(
        "id, property_id, period_month, nights_booked, gross_income, platform_fees, management_fee, cleaning_fees, other_deductions, vat_on_fees, net_payout, payout_date, status",
      )
      .order("period_month", { ascending: false }),
  ]);

  if (propertiesResult.error || paymentsResult.error || statementsResult.error) {
    console.error(
      propertiesResult.error?.message ??
        paymentsResult.error?.message ??
        statementsResult.error?.message,
    );
    return { ok: false, message: "Could not load income." };
  }

  const properties = new Map<string, { name: string; rentalType: string }>();

  for (const row of propertiesResult.data) {
    if (row.id && row.name && row.rental_type) {
      properties.set(row.id, { name: row.name, rentalType: row.rental_type });
    }
  }

  const entries: IncomeEntry[] = [];

  for (const row of paymentsResult.data) {
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
    const amount = unsignedMoney(row.amount);
    const property = invoice ? properties.get(invoice.property_id) : undefined;

    if (!invoice || !amount || !property || property.rentalType !== "long_term") {
      continue;
    }

    entries.push({
      id: `payment-${row.id}`,
      source: "payment",
      date: row.payment_date.slice(0, 10),
      propertyId: invoice.property_id,
      propertyName: property.name,
      detail: invoice.invoice_number,
      gross: amount,
      deductions: null,
      net: amount,
      status: "paid",
    });
  }

  for (const row of statementsResult.data) {
    const property = properties.get(row.property_id);
    const gross = unsignedMoney(row.gross_income);
    const net = signedMoney(row.net_payout);
    const deductions = deductionTotal(row);

    if (
      !property ||
      property.rentalType !== "short_term" ||
      !gross ||
      !net ||
      deductions === null ||
      !isStatementStatus(row.status)
    ) {
      continue;
    }

    const month = formatMonthLabel(row.period_month.slice(0, 7));
    const nights =
      Number.isInteger(row.nights_booked) && row.nights_booked === 1
        ? "1 night"
        : `${row.nights_booked} nights`;

    entries.push({
      id: `statement-${row.id}`,
      source: "statement",
      date: (row.payout_date ?? row.period_month).slice(0, 10),
      propertyId: row.property_id,
      propertyName: property.name,
      detail: `${month} · ${nights}`,
      gross,
      deductions,
      net,
      status: row.status,
    });
  }

  entries.sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    return left.propertyName.localeCompare(right.propertyName, "en-ZA");
  });

  const propertyOptions = [...properties.entries()]
    .map(([id, property]) => ({ id, name: property.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "en-ZA"));

  return {
    ok: true,
    entries,
    properties: propertyOptions,
  };
}

function deductionTotal(row: {
  platform_fees: number | string;
  management_fee: number | string;
  cleaning_fees: number | string;
  other_deductions: number | string;
  vat_on_fees: number | string;
}): string | null {
  const platformFees = unsignedMoney(row.platform_fees);
  const managementFee = unsignedMoney(row.management_fee);
  const cleaningFees = unsignedMoney(row.cleaning_fees);
  const otherDeductions = unsignedMoney(row.other_deductions);
  const vatOnFees = unsignedMoney(row.vat_on_fees);

  if (!platformFees || !managementFee || !cleaningFees || !otherDeductions || !vatOnFees) {
    return null;
  }

  const cents = deductionsCents({
    grossIncome: "0.00",
    platformFees,
    managementFee,
    cleaningFees,
    otherDeductions,
    vatOnFees,
  });

  return cents === null ? null : centsToMoney(cents);
}

function unsignedMoney(value: number | string | null): string | null {
  if (value === null) {
    return null;
  }

  const raw = typeof value === "number" ? value.toFixed(2) : value;
  const parsed = parseDecimal(raw, MONEY);

  return parsed.ok ? parsed.canonical : null;
}

function signedMoney(value: number | string | null): string | null {
  if (value === null) {
    return null;
  }

  const raw = typeof value === "number" ? value.toFixed(2) : value;
  const parsed = parseDecimal(raw, SIGNED_MONEY);

  return parsed.ok ? parsed.canonical : null;
}
