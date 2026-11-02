import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { MONEY, SIGNED_MONEY, parseDecimal } from "@/lib/money";
import { pageBounds, pageCountFor } from "@/lib/pagination";
import { isStatementStatus } from "@/lib/statements/labels";
import type { OwnerStatement } from "@/lib/statements/types";

const columns =
  "id, property_id, period_month, statement_date, manager_name, nights_booked, bookings_count, gross_income, platform_fees, management_fee, cleaning_fees, other_deductions, vat_on_fees, net_payout, payout_date, status, file_path";

export async function listPropertyStatements(propertyId: string, page: number): Promise<
  | { ok: true; statements: OwnerStatement[]; page: number; pageCount: number }
  | { ok: false; message: string }
> {
  if (!z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load owner's statements." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const bounds = pageBounds(page);
  const { data, error, count } = await actor.supabase
    .from("owner_statements")
    .select(columns, { count: "exact" })
    .eq("property_id", propertyId)
    .order("period_month", { ascending: false })
    .range(bounds.from, bounds.to);

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load owner's statements." };
  }

  const statements = data.flatMap((row) => {
    const statement = mapStatement(row);
    return statement ? [statement] : [];
  });

  return {
    ok: true,
    page,
    pageCount: pageCountFor(count ?? statements.length),
    statements,
  };
}

function mapStatement(row: {
  id: string;
  property_id: string;
  period_month: string;
  statement_date: string | null;
  manager_name: string | null;
  nights_booked: number;
  bookings_count: number;
  gross_income: number | string;
  platform_fees: number | string;
  management_fee: number | string;
  cleaning_fees: number | string;
  other_deductions: number | string;
  vat_on_fees: number | string;
  net_payout: number | string;
  payout_date: string | null;
  status: string;
  file_path: string;
}): OwnerStatement | null {
  const grossIncome = unsignedMoney(row.gross_income);
  const platformFees = unsignedMoney(row.platform_fees);
  const managementFee = unsignedMoney(row.management_fee);
  const cleaningFees = unsignedMoney(row.cleaning_fees);
  const otherDeductions = unsignedMoney(row.other_deductions);
  const vatOnFees = unsignedMoney(row.vat_on_fees);
  const netPayout = signedMoney(row.net_payout);

  if (
    !grossIncome ||
    !platformFees ||
    !managementFee ||
    !cleaningFees ||
    !otherDeductions ||
    !vatOnFees ||
    !netPayout ||
    !isStatementStatus(row.status) ||
    !Number.isInteger(row.nights_booked) ||
    !Number.isInteger(row.bookings_count)
  ) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    periodMonth: row.period_month.slice(0, 10),
    statementDate: row.statement_date?.slice(0, 10) ?? null,
    managerName: row.manager_name,
    nightsBooked: row.nights_booked,
    bookingsCount: row.bookings_count,
    grossIncome,
    platformFees,
    managementFee,
    cleaningFees,
    otherDeductions,
    vatOnFees,
    netPayout,
    payoutDate: row.payout_date?.slice(0, 10) ?? null,
    status: row.status,
    filePath: row.file_path,
  };
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
