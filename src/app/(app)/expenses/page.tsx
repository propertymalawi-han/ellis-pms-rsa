import type { Metadata } from "next";

import { ExpenseBrowser } from "@/components/expenses/expense-browser";
import { PageHeader } from "@/components/layout/page-header";
import { getActor } from "@/lib/auth/access";
import { loadExpenses } from "@/lib/expenses/queries";
import { johannesburgDateOnly } from "@/lib/format";

export const metadata: Metadata = {
  title: "Expenses",
};

export default async function ExpensesPage() {
  const [expenses, actor] = await Promise.all([loadExpenses(), getActor()]);
  const today = johannesburgDateOnly();

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Supplier invoices, VAT and payments. The tax year runs from 1 March to 28/29 February."
      />
      {expenses.ok ? (
        <ExpenseBrowser
          expenses={expenses.expenses}
          categories={expenses.categories}
          properties={expenses.properties}
          today={today}
          canDelete={actor.ok && actor.isAdmin}
        />
      ) : (
        <p className="text-sm text-destructive">{expenses.message}</p>
      )}
    </div>
  );
}
