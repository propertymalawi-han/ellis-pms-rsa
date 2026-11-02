import { canonicalMoney, centsToMoney, moneyToCents, vatCents } from "@/lib/invoices/calc";
import { daysUntil, taxYearForIso } from "@/lib/format";
import { UPCOMING_DAYS, type ExpenseStatus } from "@/lib/expenses/labels";
import type { Expense, ExpenseCategory } from "@/lib/expenses/types";

export { canonicalMoney };

/** Invoice date when it is set, otherwise the due date. That is the tax-year date. */
export function expenseTaxDate(expense: {
  invoiceDate: string | null;
  dueDate: string;
}): string {
  return expense.invoiceDate ?? expense.dueDate;
}

export function effectiveStatus(
  expense: { status: ExpenseStatus; paidDate: string | null; dueDate: string },
  today: string,
): ExpenseStatus {
  if (expense.status === "paid" || expense.paidDate) {
    return "paid";
  }

  if (expense.dueDate < today) {
    return "overdue";
  }

  return "due";
}

export function isUpcoming(
  expense: { status: ExpenseStatus; paidDate: string | null; dueDate: string },
  today: string,
): boolean {
  if (effectiveStatus(expense, today) !== "due") {
    return false;
  }

  const days = daysUntil(expense.dueDate, today);

  return days !== null && days >= 0 && days <= UPCOMING_DAYS;
}

export function vatFromExcl(exclCanonical: string): string {
  return centsToMoney(vatCents(moneyToCents(exclCanonical), true));
}

export function addMoney(left: string, right: string): string {
  return centsToMoney(moneyToCents(left) + moneyToCents(right));
}

export function subtractMoney(left: string, right: string): string | null {
  const cents = moneyToCents(left) - moneyToCents(right);

  if (cents < BigInt(0)) {
    return null;
  }

  return centsToMoney(cents);
}

export type CategoryTotal = {
  categoryId: string;
  name: string;
  sortOrder: number;
  excl: string;
  vat: string;
  total: string;
};

export function categoryTotals(
  expenses: Expense[],
  categories: ExpenseCategory[],
  includeEmpty = false,
): CategoryTotal[] {
  const sums = new Map<string, { excl: bigint; vat: bigint; total: bigint }>();

  for (const expense of expenses) {
    const current = sums.get(expense.categoryId) ?? {
      excl: BigInt(0),
      vat: BigInt(0),
      total: BigInt(0),
    };
    current.excl += moneyToCents(expense.amountExclVat);
    current.vat += moneyToCents(expense.vatAmount);
    current.total += moneyToCents(expense.total);
    sums.set(expense.categoryId, current);
  }

  return categories
    .filter((category) => includeEmpty || sums.has(category.id))
    .map((category) => {
      const current = sums.get(category.id) ?? {
        excl: BigInt(0),
        vat: BigInt(0),
        total: BigInt(0),
      };

      return {
        categoryId: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        excl: centsToMoney(current.excl),
        vat: centsToMoney(current.vat),
        total: centsToMoney(current.total),
      };
    });
}

export function grandTotals(rows: CategoryTotal[]): {
  excl: string;
  vat: string;
  total: string;
} {
  let excl = BigInt(0);
  let vat = BigInt(0);
  let total = BigInt(0);

  for (const row of rows) {
    excl += moneyToCents(row.excl);
    vat += moneyToCents(row.vat);
    total += moneyToCents(row.total);
  }

  return {
    excl: centsToMoney(excl),
    vat: centsToMoney(vat),
    total: centsToMoney(total),
  };
}

export function inTaxYear(
  expense: { invoiceDate: string | null; dueDate: string },
  taxYear: string,
): boolean {
  return taxYearForIso(expenseTaxDate(expense)) === taxYear;
}
