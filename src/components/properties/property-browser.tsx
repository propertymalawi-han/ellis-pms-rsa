"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Plus, Search, Table2 } from "lucide-react";

import {
  PropertyStatusBadge,
  RentalTypeBadge,
} from "@/components/properties/property-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatZAR } from "@/lib/format";
import {
  locationLabel,
  optionList,
  propertyStatuses,
  propertyStatusLabels,
  propertyTypeLabels,
  rentalTypeLabels,
  rentalTypes,
  type PropertyStatus,
  type RentalType,
} from "@/lib/properties/labels";
import type { PropertyListItem } from "@/lib/properties/types";
import { cn } from "@/lib/utils";

type ViewMode = "cards" | "table";
type RentalFilter = "all" | RentalType;
type StatusFilter = "all" | PropertyStatus;

const VIEW_STORAGE_KEY = "ellis-properties-view";

const rentalFilters = [
  { value: "all" as const, label: "All rental types" },
  ...optionList(rentalTypes, rentalTypeLabels),
];

const statusFilters = [
  { value: "all" as const, label: "All statuses" },
  ...optionList(propertyStatuses, propertyStatusLabels),
];

export function PropertyBrowser({
  properties,
  isAdmin,
}: {
  properties: PropertyListItem[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [rentalType, setRentalType] = useState<RentalFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("cards");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);

    if (stored === "cards" || stored === "table") {
      setView(stored);
    }
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return properties.filter((property) => {
      if (rentalType !== "all" && property.rentalType !== rentalType) {
        return false;
      }

      if (status !== "all" && property.status !== status) {
        return false;
      }

      if (query === "") {
        return true;
      }

      const haystack = [property.name, property.suburb, property.city]
        .filter((part): part is string => Boolean(part))
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [properties, rentalType, search, status]);

  function updateView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  if (properties.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No properties yet</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Add a long-term or short-term rental to start the portfolio."
              : "Properties assigned to you will show up here."}
          </CardDescription>
        </CardHeader>
        {isAdmin ? (
          <CardContent>
            <AddPropertyLink />
          </CardContent>
        ) : null}
      </Card>
    );
  }

  const filtersActive =
    search.trim() !== "" || rentalType !== "all" || status !== "all";

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, suburb or city"
              aria-label="Search properties"
              className="pl-8"
              type="search"
            />
          </div>
          <FilterSelect
            label="Rental type"
            value={rentalType}
            options={rentalFilters}
            onChange={(value) => setRentalType(value as RentalFilter)}
          />
          <FilterSelect
            label="Status"
            value={status}
            options={statusFilters}
            onChange={(value) => setStatus(value as StatusFilter)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <p className="text-sm text-muted-foreground">
            {filtered.length === properties.length
              ? `${properties.length} ${properties.length === 1 ? "property" : "properties"}`
              : `${filtered.length} of ${properties.length}`}
          </p>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <Button
              type="button"
              size="icon-sm"
              variant={view === "cards" ? "secondary" : "ghost"}
              aria-pressed={view === "cards"}
              aria-label="Card view"
              onClick={() => updateView("cards")}
            >
              <LayoutGrid />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant={view === "table" ? "secondary" : "ghost"}
              aria-pressed={view === "table"}
              aria-label="Table view"
              onClick={() => updateView("table")}
            >
              <Table2 />
            </Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matching properties</CardTitle>
            <CardDescription>
              Nothing matches this search or filter.
            </CardDescription>
          </CardHeader>
          {filtersActive ? (
            <CardContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setRentalType("all");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((property) => (
            <PropertyCard key={property.id} property={property} isAdmin={isAdmin} />
          ))}
        </div>
      ) : (
        <PropertyTable properties={filtered} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function AddPropertyLink() {
  return (
    <Link href="/properties/new" className={cn(buttonVariants())}>
      <Plus />
      Add property
    </Link>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PropertyCard({
  property,
  isAdmin,
}: {
  property: PropertyListItem;
  isAdmin: boolean;
}) {
  const location = locationLabel(property.suburb, property.city);

  return (
    <Link
      href={`/properties/${property.id}`}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="break-words">{property.name}</CardTitle>
          <CardDescription>
            {location ?? "Location not set"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RentalTypeBadge type={property.rentalType} />
            <PropertyStatusBadge status={property.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {propertyTypeLabels[property.propertyType]}
          </p>
          {isAdmin ? (
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <MoneyFact label="Purchase price" amount={property.purchasePrice} />
              <MoneyFact label="Current value" amount={property.currentValue} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function PropertyTable({
  properties,
  isAdmin,
}: {
  properties: PropertyListItem[];
  isAdmin: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Rental type</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            {isAdmin ? <TableHead>Purchase price</TableHead> : null}
            {isAdmin ? <TableHead>Current value</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((property) => {
            const location = locationLabel(property.suburb, property.city);

            return (
              <TableRow key={property.id}>
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/properties/${property.id}`}
                    className="font-medium hover:underline"
                  >
                    {property.name}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {location ?? "—"}
                </TableCell>
                <TableCell>
                  <RentalTypeBadge type={property.rentalType} />
                </TableCell>
                <TableCell>{propertyTypeLabels[property.propertyType]}</TableCell>
                <TableCell>
                  <PropertyStatusBadge status={property.status} />
                </TableCell>
                {isAdmin ? (
                  <TableCell>{moneyText(property.purchasePrice)}</TableCell>
                ) : null}
                {isAdmin ? (
                  <TableCell>{moneyText(property.currentValue)}</TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MoneyFact({
  label,
  amount,
}: {
  label: string;
  amount: number | null;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{moneyText(amount)}</p>
    </div>
  );
}

function moneyText(amount: number | null): string {
  return amount === null ? "—" : formatZAR(amount);
}
