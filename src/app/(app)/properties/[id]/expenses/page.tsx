import { notFound } from "next/navigation";

import { ExpenseBrowser } from "@/components/expenses/expense-browser";
import { TablePager } from "@/components/ui/table-pager";
import { loadExpenses } from "@/lib/expenses/queries";
import { johannesburgDateOnly } from "@/lib/format";
import { parsePage } from "@/lib/pagination";
import { propertyTabPath } from "@/lib/properties/paths";
import { getProperty } from "@/lib/properties/queries";

type ExpensesPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function PropertyExpensesPage({
  params,
  searchParams,
}: ExpensesPageProps) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const [result, expenseDesk] = await Promise.all([
    getProperty(id),
    loadExpenses(id, page),
  ]);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return <p className="text-sm text-destructive">{result.message}</p>;
  }

  if (!expenseDesk.ok) {
    return <p className="text-sm text-destructive">{expenseDesk.message}</p>;
  }

  return (
    <div className="grid gap-4">
      <ExpenseBrowser
        expenses={expenseDesk.expenses}
        categories={expenseDesk.categories}
        properties={expenseDesk.properties}
        today={johannesburgDateOnly()}
        lockedProperty={{ id, name: result.property.name }}
        heading="Expenses"
        canDelete={result.isAdmin}
      />
      <TablePager
        page={expenseDesk.page}
        pageCount={expenseDesk.pageCount}
        path={propertyTabPath(id, "expenses")}
      />
    </div>
  );
}
