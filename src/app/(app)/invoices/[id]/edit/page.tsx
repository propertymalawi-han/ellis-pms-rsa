import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageHeader } from "@/components/layout/page-header";
import { listLeaseOptions, getInvoice } from "@/lib/invoices/queries";
import { invoiceToFormValues } from "@/lib/invoices/schema";

type EditInvoicePageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Edit invoice",
};

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const { id } = await params;
  const [invoice, leases] = await Promise.all([getInvoice(id), listLeaseOptions()]);

  if (!invoice.ok && invoice.status === "not_found") {
    notFound();
  }

  if (!invoice.ok) {
    return (
      <div>
        <PageHeader title="Edit invoice" description="Could not load this invoice." />
        <p className="text-sm text-destructive">{invoice.message}</p>
      </div>
    );
  }

  if (!leases.ok) {
    return (
      <div>
        <PageHeader title="Edit invoice" description="Could not load this invoice." />
        <p className="text-sm text-destructive">{leases.message}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${invoice.invoice.invoiceNumber}`}
        description="Update the period, due date, notes, and lines. Lines stay as they are once a payment has been recorded."
      />
      <InvoiceForm
        invoiceId={invoice.invoice.id}
        leases={leases.leases}
        defaultValues={invoiceToFormValues(invoice.invoice)}
        linesLocked={invoice.invoice.amountPaid !== "0.00"}
      />
    </div>
  );
}
