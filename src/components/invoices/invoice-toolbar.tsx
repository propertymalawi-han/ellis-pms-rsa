"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { Button } from "@/components/ui/button";
import { deleteInvoice, markInvoiceSent, openInvoicePdf } from "@/lib/invoices/actions";
import { balanceCents, centsToMoney } from "@/lib/invoices/calc";
import type { InvoiceDetail } from "@/lib/invoices/types";
import { decimalToInput } from "@/lib/money";

export function InvoiceToolbar({
  invoice,
  today,
}: {
  invoice: InvoiceDetail;
  today: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"sent" | "delete" | "pdf" | null>(null);
  const balance = balanceCents(invoice.total, invoice.amountPaid);
  const canDelete = !invoice.issued && invoice.amountPaid === "0.00";

  async function onSent() {
    setPending("sent");
    const result = await markInvoiceSent(invoice.id);
    setPending(null);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Invoice marked as sent.");
    router.refresh();
  }

  async function onDelete() {
    setPending("delete");
    const result = await deleteInvoice(invoice.id);
    setPending(null);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Invoice deleted.");
    router.push("/invoices");
    router.refresh();
  }

  async function onPdf() {
    setPending("pdf");
    const result = await openInvoicePdf(invoice.id);
    setPending(null);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={onPdf} disabled={pending !== null}>
        {pending === "pdf" ? "Preparing PDF…" : "Download PDF"}
      </Button>
      <Button variant="outline" asChild>
        <Link href={`/invoices/${invoice.id}/edit`}>Edit</Link>
      </Button>
      {!invoice.issued ? (
        <Button type="button" variant="outline" onClick={onSent} disabled={pending !== null}>
          {pending === "sent" ? "Saving…" : "Mark as sent"}
        </Button>
      ) : null}
      {balance > BigInt(0) ? (
        <RecordPaymentDialog
          invoiceId={invoice.id}
          defaultAmount={decimalToInput(centsToMoney(balance))}
          defaultDate={today}
        />
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={pending !== null}
        >
          {pending === "delete" ? "Deleting…" : "Delete draft"}
        </Button>
      ) : null}
    </>
  );
}
