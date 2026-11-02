"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercentRatio, formatZAR } from "@/lib/format";
import { moneyToCents } from "@/lib/invoices/calc";
import { propertyTypeLabels, rentalTypeLabels } from "@/lib/properties/labels";
import type { ComparisonRow } from "@/lib/reporting/aggregate";
import { cn } from "@/lib/utils";

type SortKey =
  | "property"
  | "type"
  | "rentalType"
  | "income"
  | "expenses"
  | "netIncome"
  | "grossYield"
  | "netYield"
  | "cashOnCash"
  | "capitalGrowth";

type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; kind: "text" | "money" | "ratio" }[] = [
  { key: "property", label: "Property", align: "left", kind: "text" },
  { key: "type", label: "Type", align: "left", kind: "text" },
  { key: "rentalType", label: "Rental type", align: "left", kind: "text" },
  { key: "income", label: "Income", align: "right", kind: "money" },
  { key: "expenses", label: "Expenses", align: "right", kind: "money" },
  { key: "netIncome", label: "Net income", align: "right", kind: "money" },
  { key: "grossYield", label: "Gross yield", align: "right", kind: "ratio" },
  { key: "netYield", label: "Net yield", align: "right", kind: "ratio" },
  { key: "cashOnCash", label: "Cash-on-cash", align: "right", kind: "ratio" },
  { key: "capitalGrowth", label: "Capital growth", align: "right", kind: "ratio" },
];

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "property",
    direction: "asc",
  });
  const sorted = [...rows].sort((left, right) => compareRows(left, right, sort.key, sort.direction));

  function toggle(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "property" || key === "type" || key === "rentalType" ? "asc" : "desc" },
    );
  }

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Properties</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Active properties for this period. Yields are annualised. Select a row to open the property.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active properties.</p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.key}
                    aria-sort={
                      sort.key === column.key
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={column.align === "right" ? "text-right" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1",
                        column.align === "right" && "ml-auto",
                      )}
                    >
                      {column.label}
                      {sort.key === column.key ? (
                        sort.direction === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow
                  key={row.propertyId}
                  className="cursor-pointer"
                  onClick={() => router.push(`/properties/${row.propertyId}`)}
                >
                  <TableCell>
                    <Link
                      href={`/properties/${row.propertyId}`}
                      className="font-medium"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.propertyName}
                    </Link>
                  </TableCell>
                  <TableCell>{propertyTypeLabels[row.propertyType]}</TableCell>
                  <TableCell>{rentalTypeLabels[row.rentalType]}</TableCell>
                  <TableCell className="text-right">{formatZAR(row.income)}</TableCell>
                  <TableCell className="text-right">{formatZAR(row.expenses)}</TableCell>
                  <TableCell className="text-right">{formatZAR(row.netIncome)}</TableCell>
                  <TableCell className="text-right">{ratio(row.grossYield)}</TableCell>
                  <TableCell className="text-right">{ratio(row.netYield)}</TableCell>
                  <TableCell className="text-right">{ratio(row.cashOnCash)}</TableCell>
                  <TableCell className="text-right">{ratio(row.capitalGrowth)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function ratio(value: string | null): string {
  return value === null ? "—" : formatPercentRatio(value);
}

function compareRows(
  left: ComparisonRow,
  right: ComparisonRow,
  key: SortKey,
  direction: SortDirection,
): number {
  if (key === "property" || key === "type" || key === "rentalType") {
    const result = textValue(left, key).localeCompare(textValue(right, key), "en-ZA");
    return direction === "asc" ? result : -result;
  }

  if (key === "income" || key === "expenses" || key === "netIncome") {
    const result = compareMoney(left[key], right[key]);
    return direction === "asc" ? result : -result;
  }

  return compareNullable(left[key], right[key], direction);
}

function textValue(row: ComparisonRow, key: "property" | "type" | "rentalType"): string {
  if (key === "property") {
    return row.propertyName;
  }

  if (key === "type") {
    return propertyTypeLabels[row.propertyType];
  }

  return rentalTypeLabels[row.rentalType];
}

function compareMoney(left: string, right: string): number {
  const delta = moneyToCents(left) - moneyToCents(right);

  if (delta < BigInt(0)) {
    return -1;
  }

  if (delta > BigInt(0)) {
    return 1;
  }

  return 0;
}

function compareNullable(
  left: string | null,
  right: string | null,
  direction: SortDirection,
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  const result = compareRatio(left, right);

  return direction === "asc" ? result : -result;
}

function compareRatio(left: string, right: string): number {
  const delta = ratioUnits(left) - ratioUnits(right);

  if (delta < BigInt(0)) {
    return -1;
  }

  if (delta > BigInt(0)) {
    return 1;
  }

  return 0;
}

function ratioUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const [integer = "0", fraction = ""] = value.replace("-", "").split(".");
  const units =
    BigInt(integer || "0") * BigInt(1_000_000) +
    BigInt(fraction.padEnd(6, "0").slice(0, 6));

  return negative ? -units : units;
}
