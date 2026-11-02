import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { isExpenseRecurrence, isExpenseStatus } from "@/lib/expenses/labels";
import { isPaymentMethod } from "@/lib/invoices/labels";
import type { Expense, ExpenseCategory, ExpenseProperty } from "@/lib/expenses/types";
import { MONEY, parseDecimal } from "@/lib/money";

const expenseColumns =
  "id, property_id, category_id, supplier, description, invoice_number, invoice_date, amount_excl_vat, vat_amount, total, due_date, paid_date, amount_paid, status, payment_method, recurring, recurrence, file_path, proof_file_path, rates_levies_bill_id";

export async function loadExpenses(propertyId?: string): Promise<
  | {
      ok: true;
      expenses: Expense[];
      categories: ExpenseCategory[];
      properties: ExpenseProperty[];
    }
  | { ok: false; message: string }
> {
  if (propertyId && !z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load expenses." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  let expenseQuery = actor.supabase.from("expenses").select(expenseColumns);

  if (propertyId) {
    expenseQuery = expenseQuery.eq("property_id", propertyId);
  }

  const [expensesResult, categoriesResult, propertiesResult] = await Promise.all([
    expenseQuery.order("due_date", { ascending: true }),
    actor.supabase
      .from("expense_categories")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true }),
    actor.isAdmin
      ? actor.supabase.from("properties").select("id, name").order("name", { ascending: true })
      : actor.supabase
          .from("properties_basic")
          .select("id, name")
          .order("name", { ascending: true }),
  ]);

  if (expensesResult.error || categoriesResult.error || propertiesResult.error) {
    console.error(
      expensesResult.error?.message ??
        categoriesResult.error?.message ??
        propertiesResult.error?.message,
    );
    return { ok: false, message: "Could not load expenses." };
  }

  const properties = propertiesResult.data.flatMap((row) => {
    if (!row.id || !row.name) {
      return [];
    }

    return [{ id: row.id, name: row.name }];
  });
  const propertyNames = new Map(properties.map((property) => [property.id, property.name]));
  const categories = categoriesResult.data.flatMap((row) => {
    if (!row.id || !row.name || !Number.isInteger(row.sort_order)) {
      return [];
    }

    return [{ id: row.id, name: row.name, sortOrder: row.sort_order }];
  });
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return {
    ok: true,
    categories,
    properties,
    expenses: expensesResult.data.flatMap((row) => {
      const expense = mapExpense(row, propertyNames, categoryById);
      return expense ? [expense] : [];
    }),
  };
}

function mapExpense(
  row: {
    id: string;
    property_id: string;
    category_id: string;
    supplier: string | null;
    description: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    amount_excl_vat: number | string;
    vat_amount: number | string;
    total: number | string;
    due_date: string;
    paid_date: string | null;
    amount_paid: number | string | null;
    status: string;
    payment_method: string | null;
    recurring: boolean;
    recurrence: string | null;
    file_path: string | null;
    proof_file_path: string | null;
    rates_levies_bill_id: string | null;
  },
  propertyNames: Map<string, string>,
  categories: Map<string, ExpenseCategory>,
): Expense | null {
  const category = categories.get(row.category_id);
  const amountExclVat = unsignedMoney(row.amount_excl_vat);
  const vatAmount = unsignedMoney(row.vat_amount);
  const total = unsignedMoney(row.total);
  const amountPaid = row.amount_paid === null ? null : unsignedMoney(row.amount_paid);

  if (
    !category ||
    !amountExclVat ||
    !vatAmount ||
    !total ||
    (row.amount_paid !== null && !amountPaid) ||
    !isExpenseStatus(row.status) ||
    (row.payment_method !== null && !isPaymentMethod(row.payment_method)) ||
    (row.recurrence !== null && !isExpenseRecurrence(row.recurrence)) ||
    (row.recurring && !row.recurrence) ||
    (!row.recurring && row.recurrence)
  ) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: propertyNames.get(row.property_id) ?? "Property",
    categoryId: category.id,
    categoryName: category.name,
    categorySort: category.sortOrder,
    supplier: row.supplier,
    description: row.description,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date?.slice(0, 10) ?? null,
    amountExclVat,
    vatAmount,
    total,
    dueDate: row.due_date.slice(0, 10),
    paidDate: row.paid_date?.slice(0, 10) ?? null,
    amountPaid,
    status: row.status,
    paymentMethod: row.payment_method,
    recurring: row.recurring,
    recurrence: row.recurrence,
    filePath: row.file_path,
    proofFilePath: row.proof_file_path,
    billId: row.rates_levies_bill_id,
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
