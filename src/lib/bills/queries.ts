import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { isBillStatus, isBillType } from "@/lib/bills/labels";
import type { BillProperty, RatesBill } from "@/lib/bills/types";
import { MONEY, parseDecimal } from "@/lib/money";
import { pageBounds, pageCountFor } from "@/lib/pagination";
import { propertyTypes, type PropertyType } from "@/lib/properties/labels";

const billColumns =
  "id, property_id, bill_type, issuer_name, account_number, period_month, statement_date, due_date, levy, special_levy, municipal_rates, water, electricity, refuse, sewerage, other_charges, arrears, interest, total_due, amount_paid, paid_date, status, file_path, proof_file_path";

export async function loadBills(propertyId?: string, page?: number): Promise<
  | { ok: true; bills: RatesBill[]; properties: BillProperty[]; page: number; pageCount: number }
  | { ok: false; message: string }
> {
  if (propertyId && !z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load rates and levies bills." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const bounds = typeof page === "number" ? pageBounds(page) : null;
  let billQuery = actor.supabase
    .from("rates_levies_bills")
    .select(billColumns, bounds ? { count: "exact" } : undefined);

  if (propertyId) {
    billQuery = billQuery.eq("property_id", propertyId);
  }

  const orderedBills = billQuery.order("period_month", { ascending: false });
  const [billsResult, propertiesResult] = await Promise.all([
    bounds ? orderedBills.range(bounds.from, bounds.to) : orderedBills,
    actor.isAdmin
      ? actor.supabase
          .from("properties")
          .select("id, name, property_type")
          .order("name", { ascending: true })
      : actor.supabase
          .from("properties_basic")
          .select("id, name, property_type")
          .order("name", { ascending: true }),
  ]);

  if (billsResult.error || propertiesResult.error) {
    console.error(billsResult.error?.message ?? propertiesResult.error?.message);
    return { ok: false, message: "Could not load rates and levies bills." };
  }

  const properties = propertiesResult.data.flatMap((row) => {
    if (!row.id || !row.name || !isPropertyType(row.property_type)) {
      return [];
    }

    return [{ id: row.id, name: row.name, propertyType: row.property_type }];
  });
  const propertyNames = new Map(properties.map((property) => [property.id, property.name]));
  const bills = billsResult.data.flatMap((row) => {
    const bill = mapBill(row, propertyNames);
    return bill ? [bill] : [];
  });

  return {
    ok: true,
    properties,
    page: page ?? 1,
    pageCount: bounds ? pageCountFor(billsResult.count ?? bills.length) : 1,
    bills,
  };
}

function isPropertyType(value: string | null): value is PropertyType {
  return value !== null && (propertyTypes as readonly string[]).includes(value);
}

function mapBill(
  row: {
    id: string;
    property_id: string;
    bill_type: string;
    issuer_name: string;
    account_number: string | null;
    period_month: string;
    statement_date: string | null;
    due_date: string;
    levy: number | string;
    special_levy: number | string;
    municipal_rates: number | string;
    water: number | string;
    electricity: number | string;
    refuse: number | string;
    sewerage: number | string;
    other_charges: number | string;
    arrears: number | string;
    interest: number | string;
    total_due: number | string;
    amount_paid: number | string | null;
    paid_date: string | null;
    status: string;
    file_path: string | null;
    proof_file_path: string | null;
  },
  propertyNames: Map<string, string>,
): RatesBill | null {
  const levy = unsignedMoney(row.levy);
  const specialLevy = unsignedMoney(row.special_levy);
  const municipalRates = unsignedMoney(row.municipal_rates);
  const water = unsignedMoney(row.water);
  const electricity = unsignedMoney(row.electricity);
  const refuse = unsignedMoney(row.refuse);
  const sewerage = unsignedMoney(row.sewerage);
  const otherCharges = unsignedMoney(row.other_charges);
  const arrears = unsignedMoney(row.arrears);
  const interest = unsignedMoney(row.interest);
  const totalDue = unsignedMoney(row.total_due);
  const amountPaid = row.amount_paid === null ? null : unsignedMoney(row.amount_paid);

  if (
    !isBillType(row.bill_type) ||
    !isBillStatus(row.status) ||
    !levy ||
    !specialLevy ||
    !municipalRates ||
    !water ||
    !electricity ||
    !refuse ||
    !sewerage ||
    !otherCharges ||
    !arrears ||
    !interest ||
    !totalDue ||
    (row.amount_paid !== null && !amountPaid)
  ) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: propertyNames.get(row.property_id) ?? "Property",
    billType: row.bill_type,
    issuerName: row.issuer_name,
    accountNumber: row.account_number,
    periodMonth: row.period_month.slice(0, 10),
    statementDate: row.statement_date?.slice(0, 10) ?? null,
    dueDate: row.due_date.slice(0, 10),
    levy,
    specialLevy,
    municipalRates,
    water,
    electricity,
    refuse,
    sewerage,
    otherCharges,
    arrears,
    interest,
    totalDue,
    amountPaid,
    paidDate: row.paid_date?.slice(0, 10) ?? null,
    status: row.status,
    filePath: row.file_path,
    proofFilePath: row.proof_file_path,
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
