"use client";

import { useMemo, useState } from "react";

import { StatementStatusBadge } from "@/components/statements/statement-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDateOnly, formatZAR, taxYearForIso } from "@/lib/format";
import { centsToMoney } from "@/lib/invoices/calc";
import { incomeNetCents, type IncomeEntry, type IncomeProperty } from "@/lib/income/types";

const sourceLabels = {
  payment: "Rent",
  statement: "Owner's statement",
} as const;

export function IncomeBrowser({
  entries,
  properties,
  today,
}: {
  entries: IncomeEntry[];
  properties: IncomeProperty[];
  today: string;
}) {
  const currentTaxYear = taxYearForIso(today) ?? "";
  const [propertyId, setPropertyId] = useState("all");
  const [taxYear, setTaxYear] = useState(currentTaxYear);

  const taxYears = useMemo(() => {
    const labels = new Set<string>();

    if (currentTaxYear) {
      labels.add(currentTaxYear);
    }

    for (const entry of entries) {
      const label = taxYearForIso(entry.date);

      if (label) {
        labels.add(label);
      }
    }

    return [...labels].sort((left, right) => right.localeCompare(left));
  }, [currentTaxYear, entries]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (propertyId !== "all" && entry.propertyId !== propertyId) {
        return false;
      }

      return taxYear === "" || taxYearForIso(entry.date) === taxYear;
    });
  }, [entries, propertyId, taxYear]);

  return (
    <div className="grid gap-4">
      <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">Net income</p>
        <p className="mt-1 text-xl font-medium">
          {formatZAR(centsToMoney(incomeNetCents(filtered)))}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger className="w-full sm:max-w-xs" aria-label="Property">
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
        <Select value={taxYear} onValueChange={setTaxYear}>
          <SelectTrigger className="w-full sm:max-w-xs" aria-label="Tax year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {taxYears.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="sm:ml-auto"
          disabled={filtered.length === 0}
          onClick={() => downloadCsv(filtered, taxYear)}
        >
          Export CSV
        </Button>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No income for this property and tax year.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateOnly(entry.date)}</TableCell>
                  <TableCell>{entry.propertyName}</TableCell>
                  <TableCell>{sourceLabels[entry.source]}</TableCell>
                  <TableCell>{entry.detail}</TableCell>
                  <TableCell className="text-right">{formatZAR(entry.gross)}</TableCell>
                  <TableCell className="text-right">
                    {entry.deductions === null ? "—" : formatZAR(entry.deductions)}
                  </TableCell>
                  <TableCell className="text-right">{formatZAR(entry.net)}</TableCell>
                  <TableCell>
                    {entry.status === "paid" ? (
                      <Badge>Paid</Badge>
                    ) : (
                      <StatementStatusBadge status={entry.status} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function downloadCsv(entries: IncomeEntry[], taxYear: string) {
  const header = ["Date", "Property", "Source", "Detail", "Gross", "Deductions", "Net", "Status"];
  const lines = [
    header,
    ...entries.map((entry) => [
      formatDateOnly(entry.date),
      entry.propertyName,
      sourceLabels[entry.source],
      entry.detail,
      displayMoney(entry.gross),
      entry.deductions === null ? "" : displayMoney(entry.deductions),
      displayMoney(entry.net),
      entry.status === "paid" ? "Paid" : entry.status === "received" ? "Received" : "Expected",
    ]),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `income-${taxYear.replace("/", "-") || "all"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function displayMoney(amount: string): string {
  return formatZAR(amount).replace(/[\u00a0\u202f]/g, " ");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
