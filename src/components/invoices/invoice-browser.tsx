"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { DeleteInvoiceButton } from "@/components/invoices/delete-invoice-button";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly, formatZAR } from "@/lib/format";
import { balanceCents, canDeleteInvoice, centsToMoney } from "@/lib/invoices/calc";
import {
  invoiceStatusLabels,
  isInvoiceStatus,
  type InvoiceStatus,
} from "@/lib/invoices/labels";
import { formatMonthLabel, yearMonthKey } from "@/lib/invoices/period";
import type { InvoiceListItem, PropertyOption } from "@/lib/invoices/types";

type StatusFilter = "all" | InvoiceStatus;

export function InvoiceBrowser({
  invoices,
  properties,
  today,
  canDeleteAny = false,
}: {
  invoices: InvoiceListItem[];
  properties: PropertyOption[];
  today: string;
  canDeleteAny?: boolean;
}) {
  const [propertyId, setPropertyId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [month, setMonth] = useState("all");

  const months = useMemo(() => {
    const keys = new Set(invoices.map((invoice) => yearMonthKey(invoice.periodStart)));
    keys.add(yearMonthKey(today));

    return [...keys].sort((left, right) => right.localeCompare(left));
  }, [invoices, today]);

  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      if (propertyId !== "all" && invoice.propertyId !== propertyId) {
        return false;
      }

      if (status !== "all" && invoice.status !== status) {
        return false;
      }

      if (month !== "all" && yearMonthKey(invoice.periodStart) !== month) {
        return false;
      }

      return true;
    });
  }, [invoices, month, propertyId, status]);

  const totals = useMemo(() => summarize(filtered, today), [filtered, today]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TotalCard label="Outstanding" amount={totals.outstanding} />
        <TotalCard label="Overdue" amount={totals.overdue} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger className="w-full" aria-label="Property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            if (value === "all" || isInvoiceStatus(value)) {
              setStatus(value);
            }
          }}
        >
          <SelectTrigger className="w-full" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map((item) => (
              <SelectItem key={item} value={item}>
                {invoiceStatusLabels[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full" aria-label="Month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((item) => (
              <SelectItem key={item} value={item}>
                {formatMonthLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices match these filters.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link href={`/invoices/${invoice.id}`} className="font-medium underline-offset-4 hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>{invoice.propertyName}</TableCell>
                <TableCell>{invoice.tenantName}</TableCell>
                <TableCell>{formatDateOnly(invoice.dueDate)}</TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>
                <TableCell className="text-right">{formatZAR(invoice.total)}</TableCell>
                <TableCell className="text-right">
                  {formatZAR(centsToMoney(balanceCents(invoice.total, invoice.amountPaid)))}
                </TableCell>
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
    </div>
  );
}

function TotalCard({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-medium">{formatZAR(amount)}</p>
    </div>
  );
}

function summarize(invoices: InvoiceListItem[], today: string) {
  let outstanding = BigInt(0);
  let overdue = BigInt(0);

  for (const invoice of invoices) {
    if (invoice.status === "draft" || invoice.status === "paid") {
      continue;
    }

    const balance = balanceCents(invoice.total, invoice.amountPaid);
    outstanding += balance;

    if (invoice.dueDate < today) {
      overdue += balance;
    }
  }

  return {
    outstanding: centsToMoney(outstanding),
    overdue: centsToMoney(overdue),
  };
}
