import Link from "next/link";
import { Pencil } from "lucide-react";

import { ArchivePropertyButton } from "@/components/properties/archive-property-button";
import {
  PropertyStatusBadge,
  RentalTypeBadge,
} from "@/components/properties/property-badges";
import { buttonVariants } from "@/components/ui/button";
import { formatZAR } from "@/lib/format";
import {
  locationLabel,
  propertyTypeLabels,
  provinceLabels,
} from "@/lib/properties/labels";
import type { PropertyDetail } from "@/lib/properties/types";
import { cn } from "@/lib/utils";

export function PropertyHeader({
  property,
  isAdmin,
}: {
  property: PropertyDetail;
  isAdmin: boolean;
}) {
  const place = locationLabel(property.suburb, property.city);
  const province = property.province ? provinceLabels[property.province] : null;
  const location = [place, province].filter(Boolean).join(" · ");

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-medium tracking-tight break-words">
            {property.name}
          </h1>
          <RentalTypeBadge type={property.rentalType} />
          <PropertyStatusBadge status={property.status} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {propertyTypeLabels[property.propertyType]}
          {location ? ` · ${location}` : ""}
        </p>
        {isAdmin && property.finance ? (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Purchase price </span>
            {property.finance.purchasePrice === null
              ? "—"
              : formatZAR(property.finance.purchasePrice)}
            <span className="text-muted-foreground"> · Current value </span>
            {property.finance.currentValue === null
              ? "—"
              : formatZAR(property.finance.currentValue)}
          </p>
        ) : null}
        {isAdmin && property.status === "sold" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            This property is marked as sold. Set the status back to active on
            the edit form to restore it.
          </p>
        ) : null}
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/properties/${property.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Pencil />
            Edit
          </Link>
          {property.status === "active" ? (
            <ArchivePropertyButton
              propertyId={property.id}
              propertyName={property.name}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
