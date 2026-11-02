import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillBrowser } from "@/components/bills/bill-browser";
import { ExpenseBrowser } from "@/components/expenses/expense-browser";
import { PageHeader } from "@/components/layout/page-header";
import { LeaseWarnings } from "@/components/properties/lease-warnings";
import { PropertyDocuments } from "@/components/properties/property-documents";
import { PropertyHeader } from "@/components/properties/property-header";
import { PropertyIncome } from "@/components/properties/property-income";
import { PropertyLeases } from "@/components/properties/property-leases";
import { PropertyOverview } from "@/components/properties/property-overview";
import { PropertyTabs } from "@/components/properties/property-tabs";
import { PropertyStatements } from "@/components/statements/property-statements";
import { loadBills } from "@/lib/bills/queries";
import { loadExpenses } from "@/lib/expenses/queries";
import { johannesburgDateOnly } from "@/lib/format";
import { listPropertyDocuments } from "@/lib/documents/queries";
import { listPropertyIncome } from "@/lib/invoices/queries";
import { listPropertyStatements } from "@/lib/statements/queries";
import { loadLeaseDesk } from "@/lib/leases/queries";
import { warningsForLeases } from "@/lib/leases/warnings";
import { getProperty } from "@/lib/properties/queries";
import { getPropertyFinancialSummaryForPreset } from "@/lib/reporting/queries";
import { resolvePeriodForToday } from "@/lib/reporting/period";
import type { PropertyFinancialReport } from "@/components/properties/property-financials";

const propertyTabs = ["overview", "tenants", "income", "expenses", "rates", "documents"] as const;

type PropertyTab = (typeof propertyTabs)[number];

type PropertyPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({
  params,
}: PropertyPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getProperty(id);

  if (result.status !== "ok") {
    return { title: "Property" };
  }

  return { title: result.property.name };
}

export default async function PropertyPage({ params, searchParams }: PropertyPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const defaultTab: PropertyTab = isPropertyTab(tab) ? tab : "overview";
  const result = await getProperty(id);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <div>
        <PageHeader title="Property" description="Could not load this property." />
        <p className="text-sm text-destructive">{result.message}</p>
      </div>
    );
  }

  const longTerm = result.property.rentalType === "long_term";
  const today = johannesburgDateOnly();
  const [documents, expenseDesk, billDesk, income, statements, leaseDesk, financialSummary] =
    await Promise.all([
      listPropertyDocuments(id),
      loadExpenses(id),
      loadBills(id),
      longTerm ? listPropertyIncome(id) : Promise.resolve(null),
      longTerm ? Promise.resolve(null) : listPropertyStatements(id),
      longTerm ? loadLeaseDesk(id) : Promise.resolve(null),
      result.isAdmin
        ? getPropertyFinancialSummaryForPreset("current_tax_year")
        : Promise.resolve(null),
    ]);
  const warnings = leaseDesk?.ok ? warningsForLeases(leaseDesk.leases, today) : [];
  const financials = propertyFinancials(financialSummary, id, longTerm, leaseDesk, today);

  return (
    <div>
      <PropertyHeader property={result.property} isAdmin={result.isAdmin} />
      <LeaseWarnings messages={warnings} />
      <PropertyTabs
        rentalType={result.property.rentalType}
        defaultTab={defaultTab}
        overview={
          <PropertyOverview
            property={result.property}
            isAdmin={result.isAdmin}
            financials={financials}
          />
        }
        leases={
          !longTerm ? null : leaseDesk?.ok ? (
            <PropertyLeases
              propertyId={id}
              leases={leaseDesk.leases}
              tenants={leaseDesk.tenants}
              today={today}
            />
          ) : (
            <p className="text-sm text-destructive">
              {leaseDesk && !leaseDesk.ok
                ? leaseDesk.message
                : "Could not load leases."}
            </p>
          )
        }
        income={
          longTerm ? (
            income?.ok ? (
              <PropertyIncome invoices={income.invoices} payments={income.payments} />
            ) : (
              <p className="text-sm text-destructive">
                {income && !income.ok ? income.message : "Could not load income."}
              </p>
            )
          ) : statements?.ok ? (
            <PropertyStatements
              propertyId={id}
              statements={statements.statements}
              today={today}
            />
          ) : (
            <p className="text-sm text-destructive">
              {statements && !statements.ok
                ? statements.message
                : "Could not load owner's statements."}
            </p>
          )
        }
        expenses={
          expenseDesk.ok ? (
            <ExpenseBrowser
              expenses={expenseDesk.expenses}
              categories={expenseDesk.categories}
              properties={expenseDesk.properties}
              today={today}
              lockedProperty={{ id, name: result.property.name }}
              heading="Expenses"
            />
          ) : (
            <p className="text-sm text-destructive">{expenseDesk.message}</p>
          )
        }
        rates={
          billDesk.ok ? (
            <BillBrowser
              bills={billDesk.bills}
              properties={billDesk.properties}
              today={today}
              lockedProperty={{ id, name: result.property.name }}
            />
          ) : (
            <p className="text-sm text-destructive">{billDesk.message}</p>
          )
        }
        documents={
          documents.ok ? (
            <PropertyDocuments
              propertyId={id}
              documents={documents.documents}
              isAdmin={result.isAdmin}
            />
          ) : (
            <p className="text-sm text-destructive">{documents.message}</p>
          )
        }
      />
    </div>
  );
}

function isPropertyTab(value: string | undefined): value is PropertyTab {
  return value !== undefined && (propertyTabs as readonly string[]).includes(value);
}

function propertyFinancials(
  summary: Awaited<ReturnType<typeof getPropertyFinancialSummaryForPreset>> | null,
  propertyId: string,
  longTerm: boolean,
  leaseDesk: Awaited<ReturnType<typeof loadLeaseDesk>> | null,
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

  const occupied = !longTerm
    ? null
    : leaseDesk?.ok
      ? leaseDesk.leases.some(
          (lease) =>
            lease.status === "active" && lease.startDate <= today && lease.endDate >= today,
        )
      : null;

  return {
    ok: true,
    periodLabel: period.label,
    from: period.range.from,
    to: period.range.to,
    summary: summary.rows.find((item) => item.propertyId === propertyId) ?? null,
    occupied,
  };
}
