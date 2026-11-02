import { notFound } from "next/navigation";

import { LeaseWarnings } from "@/components/properties/lease-warnings";
import { PropertyOverview } from "@/components/properties/property-overview";
import type { PropertyFinancialReport } from "@/components/properties/property-financials";
import { johannesburgDateOnly } from "@/lib/format";
import { loadLeaseSnapshot } from "@/lib/leases/queries";
import { getProperty } from "@/lib/properties/queries";
import { getPropertyFinancialSummaryForPreset } from "@/lib/reporting/queries";
import { resolvePeriodForToday } from "@/lib/reporting/period";

type OverviewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PropertyOverviewPage({ params }: OverviewPageProps) {
  const { id } = await params;
  const result = await getProperty(id);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return <p className="text-sm text-destructive">{result.message}</p>;
  }

  const longTerm = result.property.rentalType === "long_term";
  const today = johannesburgDateOnly();
  const [financialSummary, leaseSnapshot] = await Promise.all([
    result.isAdmin
      ? getPropertyFinancialSummaryForPreset("current_tax_year")
      : Promise.resolve(null),
    longTerm ? loadLeaseSnapshot(id, today) : Promise.resolve(null),
  ]);

  return (
    <div className="grid gap-4">
      <LeaseWarnings messages={leaseSnapshot?.ok ? leaseSnapshot.warnings : []} />
      <PropertyOverview
        property={result.property}
        isAdmin={result.isAdmin}
        financials={propertyFinancials(
          financialSummary,
          id,
          leaseSnapshot?.ok ? leaseSnapshot.occupied : null,
          today,
        )}
      />
    </div>
  );
}

function propertyFinancials(
  summary: Awaited<ReturnType<typeof getPropertyFinancialSummaryForPreset>> | null,
  propertyId: string,
  occupied: boolean | null,
  today: string,
): PropertyFinancialReport | null {
  if (!summary) {
    return null;
  }

  const period = resolvePeriodForToday("current_tax_year", undefined, today);

  if (!summary.ok) {
    return summary;
  }

  if (!period.ok) {
    return period;
  }

  return {
    ok: true,
    periodLabel: period.label,
    from: period.range.from,
    to: period.range.to,
    summary: summary.rows.find((item) => item.propertyId === propertyId) ?? null,
    occupied,
  };
}
