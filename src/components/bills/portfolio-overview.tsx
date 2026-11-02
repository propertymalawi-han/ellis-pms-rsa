"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ExpenseStatusBadge } from "@/components/expenses/expense-status-badge";
import { Badge } from "@/components/ui/badge";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { billStatuses, billStatusLabels } from "@/lib/bills/labels";
import {
  portfolioProperties,
  portfolioTotals,
  type PortfolioStatus,
} from "@/lib/bills/summary";
import type { BillProperty, RatesBill } from "@/lib/bills/types";
import { formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";

const filters = ["all", ...billStatuses, "missing"] as const;

type StatusFilter = (typeof filters)[number];

const filterLabels: Record<StatusFilter, string> = {
  all: "All statuses",
  due: billStatusLabels.due,
  paid: billStatusLabels.paid,
  overdue: billStatusLabels.overdue,
  missing: "No bill",
};

export function PortfolioOverview({
  bills,
  properties,
  today,
}: {
  bills: RatesBill[];
  properties: BillProperty[];
  today: string;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const rows = useMemo(
    () => portfolioProperties(bills, properties, today),
    [bills, properties, today],
  );
  const filtered = useMemo(
    () => (status === "all" ? rows : rows.filter((row) => row.status === status)),
    [rows, status],
  );
  const totals = useMemo(() => portfolioTotals(filtered), [filtered]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Status is overdue or due when a bill is still unpaid, and no bill when this month has
          not been entered. The total follows this filter. Year to date leaves out arrears.
        </p>
        <Select
          value={status}
          onValueChange={(value) => {
            if (isStatusFilter(value)) {
              setStatus(value);
            }
          }}
        >
          <SelectTrigger className="w-full sm:max-w-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filters.map((item) => (
              <SelectItem key={item} value={item}>
                {filterLabels[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No properties to show."
            : "No properties with this status."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead className="text-right">This month</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Year to date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow
                key={row.propertyId}
                className={cn(
                  row.status === "overdue" && "bg-destructive/10 hover:bg-destructive/15",
                  row.status === "missing" && "bg-amber-500/15 hover:bg-amber-500/25",
                )}
              >
                <TableCell>
                  <Link
                    href={`/properties/${row.propertyId}/rates-levies`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.propertyName}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  {row.monthTotal === null ? "—" : formatZAR(row.monthTotal)}
                </TableCell>
                <TableCell>
                  <PortfolioStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right">{formatZAR(row.outstanding)}</TableCell>
                <TableCell className="text-right">{formatZAR(row.yearToDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{formatZAR(totals.monthTotal)}</TableCell>
              <TableCell />
              <TableCell className="text-right">{formatZAR(totals.outstanding)}</TableCell>
              <TableCell className="text-right">{formatZAR(totals.yearToDate)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}

function PortfolioStatusBadge({ status }: { status: PortfolioStatus }) {
  if (status === "missing") {
    return <Badge variant="outline">No bill</Badge>;
  }

  return <ExpenseStatusBadge status={status} />;
}

function isStatusFilter(value: string): value is StatusFilter {
  return (filters as readonly string[]).includes(value);
}
