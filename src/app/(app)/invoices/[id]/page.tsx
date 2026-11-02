import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceToolbar } from "@/components/invoices/invoice-toolbar";
import { PaymentHistory } from "@/components/invoices/payment-history";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActor } from "@/lib/auth/access";
import { formatDateOnly, formatZAR, johannesburgDateOnly } from "@/lib/format";
import { balanceCents, centsToMoney } from "@/lib/invoices/calc";
import { getInvoice } from "@/lib/invoices/queries";

type InvoicePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: InvoicePageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getInvoice(id);

  if (!result.ok) {
    return { title: "Invoice" };
  }

  return { title: result.invoice.invoiceNumber };
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params;
  const [result, actor] = await Promise.all([getInvoice(id), getActor()]);

  if (!result.ok && result.status === "not_found") {
    notFound();
  }

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Invoice" description="Could not load this invoice." />
        <p className="text-sm text-destructive">{result.message}</p>
      </div>
    );
  }

  const invoice = result.invoice;
  const balance = centsToMoney(balanceCents(invoice.total, invoice.amountPaid));

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${invoice.propertyName} · ${invoice.tenantName}`}
        actions={
          actor.ok ? <InvoiceToolbar invoice={invoice} today={johannesburgDateOnly()} /> : null
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <InvoiceStatusBadge status={invoice.status} />
        <span>Issued {formatDateOnly(invoice.issueDate)}</span>
        <span>Due {formatDateOnly(invoice.dueDate)}</span>
        <span>
          Period {formatDateOnly(invoice.periodStart)} to {formatDateOnly(invoice.periodEnd)}
        </span>
        <Link
          href={`/properties/${invoice.propertyId}`}
          className="underline-offset-4 hover:underline"
        >
          View property
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead>VAT</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.description}</TableCell>
              <TableCell className="text-right">{line.quantity}</TableCell>
              <TableCell className="text-right">{formatZAR(line.unitPrice)}</TableCell>
              <TableCell>{line.vatApplicable ? "15%" : "No"}</TableCell>
              <TableCell className="text-right">{formatZAR(line.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <dl className="mt-4 grid max-w-xs gap-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Subtotal</dt>
          <dd>{formatZAR(invoice.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>VAT</dt>
          <dd>{formatZAR(invoice.vatAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 font-medium">
          <dt>Total</dt>
          <dd>{formatZAR(invoice.total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Paid</dt>
          <dd>{formatZAR(invoice.amountPaid)}</dd>
        </div>
        <div className="flex justify-between gap-4 font-medium">
          <dt>Balance</dt>
          <dd>{formatZAR(balance)}</dd>
        </div>
      </dl>
      {invoice.notes ? <p className="mt-4 text-sm">{invoice.notes}</p> : null}
      <section className="mt-8 grid gap-3">
        <h2 className="font-heading text-lg font-medium">Payments</h2>
        <PaymentHistory payments={invoice.payments} isAdmin={actor.ok && actor.isAdmin} />
      </section>
    </div>
  );
}
