import { Badge } from "@/components/ui/badge";
import {
  invoiceStatusLabels,
  type InvoiceStatus,
} from "@/lib/invoices/labels";

const variants: Record<
  InvoiceStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  sent: "outline",
  partially_paid: "outline",
  paid: "default",
  overdue: "destructive",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={variants[status]}>{invoiceStatusLabels[status]}</Badge>;
}
