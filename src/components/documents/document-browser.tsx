"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { DocumentTable } from "@/components/documents/document-table";
import { Input } from "@/components/ui/input";
import { TablePager } from "@/components/ui/table-pager";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  categoryFilterOptions,
  isDocumentCategory,
  type DocumentCategory,
} from "@/lib/documents/labels";
import type {
  DocumentListItem,
  DocumentPropertyOption,
} from "@/lib/documents/types";

type CategoryFilter = "all" | DocumentCategory;

export function DocumentBrowser({
  documents,
  properties,
  isAdmin,
  page,
  pageCount,
}: {
  documents: DocumentListItem[];
  properties: DocumentPropertyOption[];
  isAdmin: boolean;
  page: number;
  pageCount: number;
}) {
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState("all");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return documents.filter((item) => {
      if (propertyId !== "all" && item.propertyId !== propertyId) {
        return false;
      }

      if (category !== "all" && item.category !== category) {
        return false;
      }

      if (query && !item.name.toLowerCase().includes(query)) {
        return false;
      }

      return true;
    });
  }, [category, documents, propertyId, search]);

  const filtersActive =
    search.trim() !== "" || propertyId !== "all" || category !== "all";

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
            aria-label="Search by name"
            className="pl-8"
            type="search"
          />
        </div>
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger className="w-full" aria-label="Property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(value) => {
            if (value === "all" || isDocumentCategory(value)) {
              setCategory(value);
            }
          }}
        >
          <SelectTrigger className="w-full" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
            {categoryFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        {filtersActive
          ? `${filtered.length} of ${documents.length}`
          : `${documents.length} ${documents.length === 1 ? "document" : "documents"}`}
      </p>
      <DocumentTable
        documents={filtered}
        isAdmin={isAdmin}
        showProperty
        emptyMessage={
          documents.length === 0
            ? "No documents yet."
            : "No documents match these filters."
        }
      />
      <TablePager page={page} pageCount={pageCount} path="/documents" />
    </div>
  );
}
