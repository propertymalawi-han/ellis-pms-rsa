import type { Metadata } from "next";

import { PortfolioOverview } from "@/components/bills/portfolio-overview";
import { PageHeader } from "@/components/layout/page-header";
import { loadBills } from "@/lib/bills/queries";
import { johannesburgDateOnly, taxYearForIso } from "@/lib/format";

export const metadata: Metadata = {
  title: "Rates & Levies",
};

export default async function RatesLeviesPage() {
  const bills = await loadBills();
  const today = johannesburgDateOnly();
  const taxYear = taxYearForIso(today);

  return (
    <div>
      <PageHeader
        title="Rates & Levies"
        description={
          taxYear
            ? `Each property you can access, with this month's total due, payment status, outstanding balance and charges for tax year ${taxYear}.`
            : "Each property you can access, with this month's total due, payment status and outstanding balance."
        }
      />
      {bills.ok ? (
        <PortfolioOverview bills={bills.bills} properties={bills.properties} today={today} />
      ) : (
        <p className="text-sm text-destructive">{bills.message}</p>
      )}
    </div>
  );
}
