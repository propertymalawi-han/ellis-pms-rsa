"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly, formatZAR } from "@/lib/format";
import { deletePayment, openProof } from "@/lib/invoices/actions";
import { paymentMethodLabels } from "@/lib/invoices/labels";
import type { InvoicePayment } from "@/lib/invoices/types";

export function PaymentHistory({
  payments,
  isAdmin,
}: {
  payments: InvoicePayment[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onProof(paymentId: string) {
    setPendingId(paymentId);
    const result = await openProof(paymentId);
    setPendingId(null);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function onDelete(paymentId: string) {
    setPendingId(paymentId);
    const result = await deletePayment(paymentId);
    setPendingId(null);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Payment deleted.");
    router.refresh();
  }

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell>{formatDateOnly(payment.paymentDate)}</TableCell>
            <TableCell>{paymentMethodLabels[payment.method]}</TableCell>
            <TableCell>{payment.reference ?? "—"}</TableCell>
            <TableCell className="text-right">{formatZAR(payment.amount)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {payment.proofFilePath ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingId === payment.id}
                    onClick={() => onProof(payment.id)}
                  >
                    Proof
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pendingId === payment.id}
                    onClick={() => onDelete(payment.id)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
