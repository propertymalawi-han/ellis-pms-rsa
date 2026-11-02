"use client";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteInvoice } from "@/lib/invoices/actions";

export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
  issued,
  amountPaid,
  size = "sm",
  redirectTo,
}: {
  invoiceId: string;
  invoiceNumber: string;
  issued: boolean;
  amountPaid: string;
  size?: "sm" | "default";
  redirectTo?: string;
}) {
  const removesPayments = issued || Number(amountPaid) > 0;

  return (
    <ConfirmDeleteButton
      title="Delete invoice?"
      description={
        removesPayments
          ? `${invoiceNumber} and its payments will be removed.`
          : `${invoiceNumber} will be removed.`
      }
      successMessage="Invoice deleted."
      onDelete={() => deleteInvoice(invoiceId)}
      redirectTo={redirectTo}
      size={size}
    />
  );
}
