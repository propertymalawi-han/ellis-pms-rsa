import { Badge } from "@/components/ui/badge";
import { expenseStatusLabels, type ExpenseStatus } from "@/lib/expenses/labels";

export function ExpenseStatusBadge({
  status,
  upcoming,
}: {
  status: ExpenseStatus;
  upcoming?: boolean;
}) {
  if (status === "overdue") {
    return <Badge variant="destructive">Overdue</Badge>;
  }

  if (status === "paid") {
    return <Badge>{expenseStatusLabels.paid}</Badge>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline">{expenseStatusLabels.due}</Badge>
      {upcoming ? <Badge variant="secondary">Due within 14 days</Badge> : null}
    </span>
  );
}
