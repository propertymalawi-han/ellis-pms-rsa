"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { segment: "overview", label: "Overview", longTermOnly: false },
  { segment: "tenants", label: "Tenants & Leases", longTermOnly: true },
  { segment: "income", label: "Income", longTermOnly: false },
  { segment: "expenses", label: "Expenses", longTermOnly: false },
  { segment: "rates-levies", label: "Rates & Levies", longTermOnly: false },
  { segment: "documents", label: "Documents", longTermOnly: false },
] as const;

export function PropertyTabNav({
  propertyId,
  longTerm,
}: {
  propertyId: string;
  longTerm: boolean;
}) {
  const pathname = usePathname();
  const visible = tabs.filter((tab) => !tab.longTermOnly || longTerm);

  return (
    <div className="overflow-x-auto">
      <nav
        aria-label="Property sections"
        className="inline-flex h-9 w-max items-center rounded-full border border-border bg-card p-[3px] text-muted-foreground shadow-sm"
      >
        {visible.map((tab) => {
          const href = `/properties/${propertyId}/${tab.segment}`;
          const active = pathname === href;

          return (
            <Link
              key={tab.segment}
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-full items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
