import { notFound } from "next/navigation";

import { PropertyLeases } from "@/components/properties/property-leases";
import { TablePager } from "@/components/ui/table-pager";
import { johannesburgDateOnly } from "@/lib/format";
import { loadLeaseDesk } from "@/lib/leases/queries";
import { parsePage } from "@/lib/pagination";
import { propertyTabPath } from "@/lib/properties/paths";
import { getProperty } from "@/lib/properties/queries";

type TenantsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function PropertyTenantsPage({ params, searchParams }: TenantsPageProps) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const result = await getProperty(id);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return <p className="text-sm text-destructive">{result.message}</p>;
  }

  if (result.property.rentalType !== "long_term") {
    return (
      <p className="text-sm text-muted-foreground">
        Tenants and leases are for long-term rentals. This property uses owner&apos;s statements.
      </p>
    );
  }

  const leaseDesk = await loadLeaseDesk(id, page);
  const today = johannesburgDateOnly();

  if (!leaseDesk.ok) {
    return <p className="text-sm text-destructive">{leaseDesk.message}</p>;
  }

  return (
    <div className="grid gap-4">
      <PropertyLeases
        propertyId={id}
        leases={leaseDesk.leases}
        tenants={leaseDesk.tenants}
        today={today}
      />
      <TablePager
        page={leaseDesk.page}
        pageCount={leaseDesk.pageCount}
        path={propertyTabPath(id, "tenants")}
      />
    </div>
  );
}
