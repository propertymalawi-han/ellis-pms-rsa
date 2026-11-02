import type { ReactNode } from "react";
import Link from "next/link";

import { DeleteInvoiceButton } from "@/components/invoices/delete-invoice-button";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly, formatZAR } from "@/lib/format";
import { canDeleteInvoice } from "@/lib/invoices/calc";
import { paymentMethodLabels } from "@/lib/invoices/labels";
import type { InvoiceListItem, InvoicePayment } from "@/lib/invoices/types";

export function PropertyIncome({
  invoices,
  payments,
  invoicePager,
  paymentPager,
  canDeleteAny = false,
}: {
  invoices: InvoiceListItem[];
  payments: InvoicePayment[];
  invoicePager?: ReactNode;
  paymentPager?: ReactNode;
  canDeleteAny?: boolean;
}) {
  const numbers = new Map(invoices.map((invoice) => [invoice.id, invoice.invoiceNumber]));

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-medium">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices for this property yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.tenantName}</TableCell>
                  <TableCell>{formatDateOnly(invoice.dueDate)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell className="text-right">{formatZAR(invoice.total)}</TableCell>
                  <TableCell className="text-right">{formatZAR(invoice.amountPaid)}</TableCell>
                  <TableCell className="text-right">
                    {canDeleteInvoice(invoice, canDeleteAny) ? (
                      <DeleteInvoiceButton
                        invoiceId={invoice.id}
                        invoiceNumber={invoice.invoiceNumber}
                        issued={invoice.issued}
                        amountPaid={invoice.amountPaid}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {invoicePager}
      </section>
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-medium">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments for this property yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDateOnly(payment.paymentDate)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/invoices/${payment.invoiceId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {payment.invoiceNumber ?? numbers.get(payment.invoiceId) ?? "Invoice"}
                    </Link>
                  </TableCell>
                  <TableCell>{paymentMethodLabels[payment.method]}</TableCell>
                  <TableCell>{payment.reference ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatZAR(payment.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {paymentPager}
      </section>
    </div>
  );
}
