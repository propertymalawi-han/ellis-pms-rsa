"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PropertyHeader } from "@/components/properties/property-header";
import { PropertyTabNav } from "@/components/properties/property-tab-nav";
import type { PropertyDetail } from "@/lib/properties/types";

export function PropertyFrame({
  property,
  isAdmin,
  children,
}: {
  property: PropertyDetail;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const editing = pathname.endsWith("/edit");

  if (editing) {
    return children;
  }

  return (
    <div>
      <PropertyHeader property={property} isAdmin={isAdmin} />
      <PropertyTabNav
        propertyId={property.id}
        longTerm={property.rentalType === "long_term"}
      />
      <div className="pt-4">{children}</div>
    </div>
  );
}
