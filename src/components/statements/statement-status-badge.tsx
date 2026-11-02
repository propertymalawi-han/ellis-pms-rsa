import { Badge } from "@/components/ui/badge";
import {
  statementStatusLabels,
  type StatementStatus,
} from "@/lib/statements/labels";

const variants: Record<StatementStatus, "outline" | "default"> = {
  expected: "outline",
  received: "default",
};

export function StatementStatusBadge({ status }: { status: StatementStatus }) {
  return <Badge variant={variants[status]}>{statementStatusLabels[status]}</Badge>;
}
